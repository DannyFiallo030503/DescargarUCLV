import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { parseBackup } from './backup'
import type { CatalogNode } from '@/domain/catalog'
import { fixtureCatalog, fixtureRoot } from '@/domain/fixtures'

export interface SavedList {
  id: string
  name: string
  itemIds: string[]
  itemSnapshots?: Record<string, SavedListItemSnapshot>
  sortOrder?: number
  updatedAt: number
}

export interface SavedListItemSnapshot {
  id: string
  name: string
  relativePath: string
  kind: CatalogNode['kind']
  sizeBytes?: number
}

export interface FavoriteRecord {
  id: string
  savedAt: number
  snapshot: CatalogNode
}

export interface SyncState {
  phase: 'idle' | 'running' | 'paused' | 'complete' | 'partial' | 'error'
  directoriesDone: number
  filesFound: number
  deferredDirectories?: number
  lastError?: string
  lastCompletedAt?: number
  nextRetryAt?: number
}

export interface CatalogBackupV1 {
  schema: 'descargar-uclv-backup'
  version: 1
  createdAt: string
  catalog: CatalogNode[]
  favorites: FavoriteRecord[]
  lists: SavedList[]
  syncDirectories: SyncDirectory[]
  syncState: SyncState
  catalogMode: 'example' | 'live'
}

export interface SyncDirectory {
  path: string
  status: 'pending' | 'complete' | 'deferred'
  attempts?: number
  nextRetryAt?: number
  lastError?: string
}

export const MAX_AUTOMATIC_DIRECTORY_ATTEMPTS = 3

interface SettingRecord { key: string; value: unknown }

interface DescargarDatabase extends DBSchema {
  catalog: {
    key: string
    value: CatalogNode
    indexes: { 'by-parent': string; 'by-kind': string }
  }
  favorites: { key: string; value: FavoriteRecord }
  lists: { key: string; value: SavedList }
  settings: { key: string; value: SettingRecord }
  syncDirectories: {
    key: string
    value: SyncDirectory
    indexes: { 'by-status': string }
  }
}

let databasePromise: Promise<IDBPDatabase<DescargarDatabase>> | undefined

function database(): Promise<IDBPDatabase<DescargarDatabase>> {
  databasePromise ??= openDB<DescargarDatabase>('descargar-uclv', 2, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const catalog = db.createObjectStore('catalog', { keyPath: 'id' })
        catalog.createIndex('by-parent', 'parentId')
        catalog.createIndex('by-kind', 'kind')
        db.createObjectStore('favorites', { keyPath: 'id' })
        db.createObjectStore('lists', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
        const syncDirectories = db.createObjectStore('syncDirectories', { keyPath: 'path' })
        syncDirectories.createIndex('by-status', 'status')
      }
      if (oldVersion > 0 && oldVersion < 2) {
        const favorites = transaction.objectStore('favorites')
        const lists = transaction.objectStore('lists')
        const catalog = transaction.objectStore('catalog')
        let cursor = await favorites.openCursor()
        while (cursor) {
          const existing = cursor.value as { id: string; savedAt: number; snapshot?: CatalogNode }
          const snapshot = existing.snapshot ?? await catalog.get(existing.id) ?? {
            id: existing.id, parentId: null, parentPath: '/', relativePath: existing.id,
            name: existing.id.split('/').filter(Boolean).at(-1) || existing.id, kind: 'file' as const,
          }
          if (snapshot) await cursor.update({ ...existing, snapshot })
          cursor = await cursor.continue()
        }
        let listCursor = await lists.openCursor()
        while (listCursor) {
          const list = listCursor.value
          const snapshots = { ...list.itemSnapshots }
          for (const id of list.itemIds) {
            if (snapshots[id]) continue
            const node = await catalog.get(id)
            if (node) snapshots[id] = { id, name: node.name, relativePath: node.relativePath, kind: node.kind, sizeBytes: node.sizeBytes }
          }
          await listCursor.update({ ...list, itemSnapshots: snapshots })
          listCursor = await listCursor.continue()
        }
      }
    },
  })
  return databasePromise
}

export const catalogRepository = {
  async ensureFixture() {
    const db = await database()
    const existing = await db.count('catalog')
    if (existing > 0) return
    const tx = db.transaction(['catalog', 'settings', 'syncDirectories'], 'readwrite')
    await tx.objectStore('catalog').put(fixtureRoot)
    for (const node of fixtureCatalog) await tx.objectStore('catalog').put(node)
    await tx.objectStore('settings').put({ key: 'catalog-mode', value: 'example' })
    await tx.objectStore('settings').put({
      key: 'sync-state',
      value: { phase: 'idle', directoriesDone: 0, filesFound: 0 } satisfies SyncState,
    })
    await tx.objectStore('syncDirectories').put({ path: '/', status: 'pending' })
    await tx.done
  },

  async all(): Promise<CatalogNode[]> {
    const db = await database()
    return db.getAll('catalog')
  },

  async children(parentId: string): Promise<CatalogNode[]> {
    const db = await database()
    return db.getAllFromIndex('catalog', 'by-parent', parentId)
  },

  async count(): Promise<number> {
    return (await database()).count('catalog')
  },

  async isExample(): Promise<boolean> {
    const value = await (await database()).get('settings', 'catalog-mode')
    return value?.value === 'example'
  },

  async resetSyncQueue(): Promise<void> {
    const db = await database()
    const tx = db.transaction(['settings', 'syncDirectories'], 'readwrite')
    const queue = tx.objectStore('syncDirectories')
    await queue.clear()
    await queue.put({ path: '/', status: 'pending' })
    await tx.objectStore('settings').put({ key: 'sync-state', value: {
      phase: 'running', directoriesDone: 0, filesFound: 0,
    } satisfies SyncState })
    await tx.done
  },

  async nextPendingDirectory(): Promise<string | undefined> {
    const db = await database()
    const cursor = await db.transaction('syncDirectories').store.index('by-status').openCursor('pending')
    return cursor?.value.path
  },

  async deferDirectory(path: string, nextRetryAt: number | undefined, lastError: string): Promise<{ deferredDirectories: number; attempts: number }> {
    const db = await database()
    const tx = db.transaction('syncDirectories', 'readwrite')
    const queue = tx.objectStore('syncDirectories')
    const attempts = ((await queue.get(path))?.attempts ?? 0) + 1
    await queue.put({ path, status: 'deferred', attempts,
      ...(attempts < MAX_AUTOMATIC_DIRECTORY_ATTEMPTS && nextRetryAt ? { nextRetryAt } : {}), lastError })
    const deferred = await queue.index('by-status').count('deferred')
    await tx.done
    return { deferredDirectories: deferred, attempts }
  },

  async nextDueDeferredDirectory(now = Date.now()): Promise<SyncDirectory | undefined> {
    const cursor = await (await database()).transaction('syncDirectories').store.index('by-status').openCursor('deferred')
    let current = cursor
    while (current) {
      const directory = current.value
      if ((directory.attempts ?? 0) < MAX_AUTOMATIC_DIRECTORY_ATTEMPTS
        && (directory.nextRetryAt ?? 0) <= now) return directory
      current = await current.continue()
    }
    return undefined
  },

  async nextDeferredRetryAt(): Promise<number | undefined> {
    const cursor = await (await database()).transaction('syncDirectories').store.index('by-status').openCursor('deferred')
    let current = cursor
    let next: number | undefined
    while (current) {
      const directory = current.value
      if ((directory.attempts ?? 0) < MAX_AUTOMATIC_DIRECTORY_ATTEMPTS && directory.nextRetryAt !== undefined) {
        next = next === undefined ? directory.nextRetryAt : Math.min(next, directory.nextRetryAt)
      }
      current = await current.continue()
    }
    return next
  },

  async hasAutomaticSyncWork(): Promise<boolean> {
    const db = await database()
    const queue = db.transaction('syncDirectories').store
    if (await queue.index('by-status').count('pending')) return true
    const cursor = await queue.index('by-status').openCursor('deferred')
    let current = cursor
    while (current) {
      if ((current.value.attempts ?? 0) < MAX_AUTOMATIC_DIRECTORY_ATTEMPTS) return true
      current = await current.continue()
    }
    return false
  },

  async countDeferredDirectories(): Promise<number> {
    return (await database()).transaction('syncDirectories').store.index('by-status').count('deferred')
  },

  async retryDeferredDirectories(): Promise<void> {
    const db = await database()
    const tx = db.transaction(['settings', 'syncDirectories'], 'readwrite')
    const queue = tx.objectStore('syncDirectories')
    let cursor = await queue.index('by-status').openCursor('deferred')
    while (cursor) {
      await cursor.update({ ...cursor.value, status: 'pending', attempts: 0, nextRetryAt: undefined, lastError: undefined })
      cursor = await cursor.continue()
    }
    const sync = await tx.objectStore('settings').get('sync-state')
    if (sync?.value) await tx.objectStore('settings').put({
      key: 'sync-state', value: { ...sync.value, deferredDirectories: 0, lastError: undefined, nextRetryAt: undefined },
    })
    await tx.done
  },

  async commitDirectory(path: string, entries: CatalogNode[], state: SyncState): Promise<SyncState> {
    const db = await database()
    const tx = db.transaction(['catalog', 'settings', 'syncDirectories'], 'readwrite')
    const catalog = tx.objectStore('catalog')
    const settings = tx.objectStore('settings')
    const queue = tx.objectStore('syncDirectories')
    const catalogMode = await settings.get('catalog-mode')
    if (path === '/' && catalogMode?.value === 'example') {
      await catalog.clear()
      await catalog.put(fixtureRoot)
    }
    for (const entry of entries) await catalog.put(entry)
    await queue.put({ path, status: 'complete' })
    for (const entry of entries) {
      if (entry.kind !== 'directory' || await queue.get(entry.relativePath)) continue
      await queue.put({ path: entry.relativePath, status: 'pending' })
    }
    if (path === '/') await settings.put({ key: 'catalog-mode', value: 'live' })
    const committedState = { ...state, deferredDirectories: await queue.index('by-status').count('deferred') }
    await settings.put({ key: 'sync-state', value: committedState })
    await tx.done
    return committedState
  },

  async getSyncState(): Promise<SyncState> {
    const record = await (await database()).get('settings', 'sync-state')
    return (record?.value as SyncState | undefined) ?? {
      phase: 'idle', directoriesDone: 0, filesFound: 0,
    }
  },

  async saveSyncState(state: SyncState): Promise<void> {
    await (await database()).put('settings', { key: 'sync-state', value: state })
  },
}

export const favoritesRepository = {
  async all(): Promise<FavoriteRecord[]> {
    return (await (await database()).getAll('favorites'))
  },
  async toggle(id: string, snapshot?: CatalogNode): Promise<void> {
    const db = await database()
    const tx = db.transaction('favorites', 'readwrite')
    const store = tx.objectStore('favorites')
    if (await store.get(id)) await store.delete(id)
    else {
      if (!snapshot) throw new Error('No se puede guardar un favorito que ya no está en el índice.')
      await store.put({ id, savedAt: Date.now(), snapshot })
    }
    await tx.done
  },
}

export const listsRepository = {
  async all(): Promise<SavedList[]> {
    return (await (await database()).getAll('lists')).sort((a, b) => (a.sortOrder ?? a.updatedAt) - (b.sortOrder ?? b.updatedAt))
  },
  async save(list: SavedList): Promise<void> {
    await (await database()).put('lists', list)
  },
  async remove(id: string): Promise<void> {
    await (await database()).delete('lists', id)
  },
}

export const backupRepository = {
  async export(): Promise<CatalogBackupV1> {
    const db = await database()
    const tx = db.transaction(['catalog', 'favorites', 'lists', 'settings', 'syncDirectories'], 'readonly')
    const [catalog, favorites, lists, syncDirectories, syncStateRecord, catalogModeRecord] = await Promise.all([
      tx.objectStore('catalog').getAll(), tx.objectStore('favorites').getAll(), tx.objectStore('lists').getAll(),
      tx.objectStore('syncDirectories').getAll(), tx.objectStore('settings').get('sync-state'),
      tx.objectStore('settings').get('catalog-mode'),
    ])
    await tx.done
    const syncState = (syncStateRecord?.value as SyncState | undefined) ?? { phase: 'idle', directoriesDone: 0, filesFound: 0 }
    return {
      schema: 'descargar-uclv-backup', version: 1, createdAt: new Date().toISOString(),
      catalog, favorites, lists, syncDirectories, syncState: { ...syncState, phase: syncState.phase === 'running' ? 'paused' : syncState.phase },
      catalogMode: catalogModeRecord?.value === 'example' ? 'example' : 'live',
    }
  },

  async restore(input: unknown): Promise<void> {
    const serialized = JSON.stringify(input)
    if (!serialized) throw new Error('La copia no se puede leer.')
    const backup = parseBackup(serialized).backup
    const db = await database()
    const tx = db.transaction(['catalog', 'favorites', 'lists', 'settings', 'syncDirectories'], 'readwrite')
    const catalog = tx.objectStore('catalog')
    const favorites = tx.objectStore('favorites')
    const lists = tx.objectStore('lists')
    const settings = tx.objectStore('settings')
    const directories = tx.objectStore('syncDirectories')
    await Promise.all([catalog.clear(), favorites.clear(), lists.clear(), directories.clear()])
    await Promise.all([
      ...backup.catalog.map((node) => catalog.put(node)),
      ...backup.favorites.map((favorite) => favorites.put(favorite)),
      ...backup.lists.map((list) => lists.put(list)),
      ...backup.syncDirectories.map((directory) => directories.put(directory)),
      settings.put({ key: 'catalog-mode', value: backup.catalogMode }),
      settings.put({ key: 'sync-state', value: { ...backup.syncState, phase: backup.syncState.phase === 'running' ? 'paused' : backup.syncState.phase } satisfies SyncState }),
    ])
    await tx.done
  },
}
