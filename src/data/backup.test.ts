import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { parseBackup } from './backup'
import { backupRepository, type CatalogBackupV1 } from './database'

const backup: CatalogBackupV1 = {
  schema: 'descargar-uclv-backup', version: 1, createdAt: '2026-11-02T12:00:00.000Z',
  catalogMode: 'live',
  catalog: [
    { id: '/', parentId: null, parentPath: '', relativePath: '/', name: 'Biblioteca', kind: 'directory' },
    { id: '/Series/', parentId: '/', parentPath: '/', relativePath: '/Series/', name: 'Series', kind: 'directory' },
    { id: '/Series/Capitulo.mp4', parentId: '/Series/', parentPath: '/Series/', relativePath: '/Series/Capitulo.mp4', name: 'Capitulo.mp4', kind: 'file', sizeBytes: 42 },
  ],
  favorites: [{ id: '/Series/Capitulo.mp4', savedAt: 10, snapshot: {
    id: '/Series/Capitulo.mp4', parentId: '/Series/', parentPath: '/Series/', relativePath: '/Series/Capitulo.mp4', name: 'Capitulo.mp4', kind: 'file', sizeBytes: 42,
  } }],
  lists: [{ id: 'lista-1', name: 'Ver luego', itemIds: ['/Series/Capitulo.mp4'], updatedAt: 10, itemSnapshots: {
    '/Series/Capitulo.mp4': { id: '/Series/Capitulo.mp4', name: 'Capitulo.mp4', relativePath: '/Series/Capitulo.mp4', kind: 'file', sizeBytes: 42 },
  } }],
  syncDirectories: [{ path: '/', status: 'complete' }, { path: '/Series/', status: 'pending' }],
  syncState: { phase: 'paused', directoriesDone: 1, filesFound: 1 },
}

describe('versioned backup validation', () => {
  it('accepts a well-formed backup and reports its contents before restore', () => {
    const preview = parseBackup(JSON.stringify(backup))
    expect(preview).toMatchObject({ catalogCount: 3, directoryCount: 2, fileCount: 1, favoriteCount: 1, listCount: 1 })
  })

  it('preserves deferred directory checkpoints in a partial-crawl backup', () => {
    const partial = structuredClone(backup)
    partial.syncDirectories[1].status = 'deferred'
    partial.syncState = { phase: 'partial', directoriesDone: 1, filesFound: 1, deferredDirectories: 1 }
    expect(parseBackup(JSON.stringify(partial)).backup).toMatchObject({
      syncDirectories: [{ path: '/', status: 'complete' }, { path: '/Series/', status: 'deferred' }],
      syncState: { phase: 'partial', deferredDirectories: 1 },
    })
    partial.syncState.deferredDirectories = 0
    expect(() => parseBackup(JSON.stringify(partial))).toThrow('no coincide')
  })

  it('rejects malformed JSON, unsupported versions and traversal paths', () => {
    expect(() => parseBackup('{')).toThrow('JSON válido')
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow('versión')
    const malicious = structuredClone(backup)
    malicious.catalog[2].relativePath = '/../outside.mp4'
    expect(() => parseBackup(JSON.stringify(malicious))).toThrow('ruta no permitida')
  })

  it('rejects duplicate identifiers and missing parent folders', () => {
    const duplicate = structuredClone(backup)
    duplicate.catalog.push(duplicate.catalog[2])
    expect(() => parseBackup(JSON.stringify(duplicate))).toThrow('IDs repetidos')
    const orphan = structuredClone(backup)
    orphan.catalog[2].parentId = '/missing/'
    expect(() => parseBackup(JSON.stringify(orphan))).toThrow('carpeta padre')
  })

  it('replaces local stores atomically with the reviewed backup and keeps active sync paused', async () => {
    const request = indexedDB.open('descargar-uclv', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      const catalog = db.createObjectStore('catalog', { keyPath: 'id' })
      catalog.createIndex('by-parent', 'parentId')
      catalog.createIndex('by-kind', 'kind')
      db.createObjectStore('favorites', { keyPath: 'id' })
      db.createObjectStore('lists', { keyPath: 'id' })
      db.createObjectStore('settings', { keyPath: 'key' })
      const directories = db.createObjectStore('syncDirectories', { keyPath: 'path' })
      directories.createIndex('by-status', 'status')
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const current = db.transaction(['catalog', 'favorites', 'lists'], 'readwrite')
    current.objectStore('catalog').put({ id: '/', parentId: null, parentPath: '', relativePath: '/', name: 'Datos actuales', kind: 'directory' })
    current.objectStore('lists').put({ id: 'old', name: 'Antigua', itemIds: [], updatedAt: 1 })
    await new Promise<void>((resolve, reject) => { current.oncomplete = () => resolve(); current.onerror = () => reject(current.error) })
    db.close()

    const activeBackup = { ...backup, syncState: { phase: 'running' as const, directoriesDone: 1, filesFound: 1 } }
    await backupRepository.restore(activeBackup)
    const invalidBackup = structuredClone(activeBackup)
    invalidBackup.catalog[2].relativePath = '/../outside.mp4'
    await expect(backupRepository.restore(invalidBackup)).rejects.toThrow('ruta no permitida')
    const restoredDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('descargar-uclv', 2)
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const read = restoredDb.transaction(['catalog', 'favorites', 'lists', 'settings', 'syncDirectories'], 'readonly')
    const [catalogRows, favoriteRows, listRows, syncRecord] = await Promise.all([
      requestResult(read.objectStore('catalog').getAll()), requestResult(read.objectStore('favorites').getAll()),
      requestResult(read.objectStore('lists').getAll()), requestResult(read.objectStore('settings').get('sync-state')),
    ])
    expect(catalogRows.map((node: { id: string }) => node.id)).toEqual(backup.catalog.map((node) => node.id))
    expect(favoriteRows).toHaveLength(1)
    expect(listRows.map((list: { id: string }) => list.id)).toEqual(['lista-1'])
    expect(syncRecord.value.phase).toBe('paused')
    restoredDb.close()
  })
})

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
