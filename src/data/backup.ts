import type { CatalogNode } from '@/domain/catalog'
import type { CatalogBackupV1, FavoriteRecord, SavedList, SyncState } from './database'

const MAX_RECORDS = 500_000
const safePath = (value: unknown): value is string => typeof value === 'string'
  && value.startsWith('/') && !value.includes('\\')
  && value.split('/').every((part) => part !== '..' && part !== '.')
  && !/%2e(?:%2e)?(?:%2f|%5c)/i.test(value)

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validNode(value: unknown): value is CatalogNode {
  if (!record(value)) return false
  return typeof value.id === 'string' && safePath(value.id)
    && (value.parentId === null || (typeof value.parentId === 'string' && safePath(value.parentId)))
    && (typeof value.parentPath === 'string' && (value.parentPath === '' || safePath(value.parentPath)))
    && safePath(value.relativePath) && typeof value.name === 'string' && value.name.length <= 2048
    && (value.kind === 'directory' || value.kind === 'file')
    && (value.sizeBytes === undefined || (Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) >= 0))
    && (value.sourceUrl === undefined || (typeof value.sourceUrl === 'string'
      && (/^https:\/\/visuales\.uclv\.cu(?:\/|$)/i.test(value.sourceUrl) || value.sourceUrl.startsWith('/'))))
}

function validSyncState(value: unknown): value is SyncState {
  if (!record(value)) return false
  return ['idle', 'running', 'paused', 'complete', 'partial', 'error'].includes(String(value.phase))
    && Number.isSafeInteger(value.directoriesDone) && Number(value.directoriesDone) >= 0
    && Number.isSafeInteger(value.filesFound) && Number(value.filesFound) >= 0
    && (value.deferredDirectories === undefined || (Number.isSafeInteger(value.deferredDirectories) && Number(value.deferredDirectories) >= 0))
    && (value.lastError === undefined || typeof value.lastError === 'string')
    && (value.lastCompletedAt === undefined || (Number.isFinite(value.lastCompletedAt) && Number(value.lastCompletedAt) >= 0))
}

export interface BackupPreview {
  backup: CatalogBackupV1
  catalogCount: number
  favoriteCount: number
  listCount: number
  directoryCount: number
  fileCount: number
  createdAt: string
}

export function parseBackup(text: string): BackupPreview {
  if (text.length > 250 * 1024 * 1024) throw new Error('La copia supera el límite de 250 MiB.')
  let value: unknown
  try { value = JSON.parse(text) as unknown } catch { throw new Error('El archivo no contiene JSON válido.') }
  if (!record(value) || value.schema !== 'descargar-uclv-backup' || value.version !== 1) {
    throw new Error('El formato o la versión de esta copia no son compatibles.')
  }
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('La fecha de la copia no es válida.')
  if (!Array.isArray(value.catalog) || !Array.isArray(value.favorites) || !Array.isArray(value.lists)
    || !Array.isArray(value.syncDirectories) || value.catalog.length > MAX_RECORDS
    || value.favorites.length > MAX_RECORDS || value.lists.length > MAX_RECORDS || value.syncDirectories.length > MAX_RECORDS) {
    throw new Error('La copia excede los límites o no contiene las secciones requeridas.')
  }
  if (!value.catalog.every(validNode)) throw new Error('La copia contiene un elemento de catálogo inválido o una ruta no permitida.')
  const ids = new Set((value.catalog as CatalogNode[]).map((node) => node.id))
  if (ids.size !== value.catalog.length || !ids.has('/')) throw new Error('El catálogo tiene IDs repetidos o no contiene la raíz.')
  if (!value.favorites.every((item) => record(item) && typeof item.id === 'string' && safePath(item.id)
    && Number.isFinite(item.savedAt) && Number(item.savedAt) >= 0 && validNode(item.snapshot) && item.snapshot.id === item.id)) {
    throw new Error('La copia contiene un favorito inválido.')
  }
  if (new Set((value.favorites as Array<{ id: string }>).map(({ id }) => id)).size !== value.favorites.length) {
    throw new Error('La copia contiene favoritos repetidos.')
  }
  if (!value.lists.every((item) => record(item) && typeof item.id === 'string' && item.id.length > 0
    && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 60
    && Array.isArray(item.itemIds) && item.itemIds.length <= MAX_RECORDS && item.itemIds.every((id) => typeof id === 'string' && safePath(id))
    && new Set(item.itemIds).size === item.itemIds.length && Number.isFinite(item.updatedAt) && Number(item.updatedAt) >= 0
    && (item.sortOrder === undefined || Number.isSafeInteger(item.sortOrder)))) throw new Error('La copia contiene una lista inválida.')
  if (new Set((value.lists as Array<{ id: string }>).map(({ id }) => id)).size !== value.lists.length) {
    throw new Error('La copia contiene IDs de lista repetidos.')
  }
  if (!value.syncDirectories.every((item) => record(item) && safePath(item.path)
    && (item.status === 'pending' || item.status === 'complete' || item.status === 'deferred'))) throw new Error('El checkpoint de catálogo no es válido.')
  if (new Set((value.syncDirectories as Array<{ path: string }>).map(({ path }) => path)).size !== value.syncDirectories.length) {
    throw new Error('El checkpoint contiene carpetas repetidas.')
  }
  if (!validSyncState(value.syncState) || (value.catalogMode !== 'example' && value.catalogMode !== 'live')) {
    throw new Error('El estado de sincronización de la copia no es válido.')
  }
  const deferredCount = (value.syncDirectories as Array<{ status: string }>).filter((item) => item.status === 'deferred').length
  const backupSyncState = value.syncState as SyncState
  if ((backupSyncState.deferredDirectories ?? 0) !== deferredCount
    || (backupSyncState.phase === 'partial' && deferredCount === 0)
    || (backupSyncState.phase === 'complete' && deferredCount > 0)) {
    throw new Error('El estado parcial no coincide con las carpetas aplazadas del checkpoint.')
  }
  const backup = value as unknown as CatalogBackupV1
  validateBackupRelations(backup)
  return {
    backup, catalogCount: backup.catalog.length, favoriteCount: backup.favorites.length,
    listCount: backup.lists.length, directoryCount: backup.catalog.filter((node) => node.kind === 'directory').length,
    fileCount: backup.catalog.filter((node) => node.kind === 'file').length, createdAt: backup.createdAt,
  }
}

export function makeBackupDocument(backup: CatalogBackupV1): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function validateBackupRelations(backup: CatalogBackupV1): void {
  const byId = new Map(backup.catalog.map((node) => [node.id, node]))
  const ids = new Set(byId.keys())
  const root = byId.get('/')
  if (!root || root.kind !== 'directory' || root.parentId !== null) throw new Error('La copia debe tener una carpeta raíz válida.')
  for (const node of backup.catalog) {
    if (node.id !== node.relativePath) throw new Error(`La ruta de “${node.name}” no coincide con su identificador.`)
    if (node.id !== '/' && (!node.parentId || !ids.has(node.parentId))) throw new Error(`Falta la carpeta padre de “${node.name}”.`)
    if (node.id !== '/' && byId.get(node.parentId!)?.kind !== 'directory') throw new Error(`El padre de “${node.name}” no es una carpeta.`)
    if (node.id !== '/' && node.parentPath !== node.parentId) throw new Error(`La carpeta contenedora de “${node.name}” no coincide con su ruta.`)
    if (node.kind === 'directory' && node.id !== '/' && !node.relativePath.endsWith('/')) throw new Error(`La ruta de la carpeta “${node.name}” debe terminar en /.`)
    if (node.kind === 'file' && node.relativePath.endsWith('/')) throw new Error(`La ruta del archivo “${node.name}” no es válida.`)
  }
  for (const favorite of backup.favorites as FavoriteRecord[]) {
    if (favorite.snapshot.kind === 'directory' && favorite.snapshot.id !== '/' && !safePath(favorite.snapshot.relativePath)) {
      throw new Error('La copia contiene una ruta de favorito inválida.')
    }
  }
  for (const list of backup.lists as SavedList[]) {
    if (list.itemSnapshots && (!record(list.itemSnapshots) || Object.entries(list.itemSnapshots).some(([id, snapshot]) => !record(snapshot)
      || typeof snapshot.id !== 'string' || !safePath(snapshot.id) || typeof snapshot.name !== 'string'
      || snapshot.id !== id || !safePath(snapshot.relativePath) || (snapshot.kind !== 'file' && snapshot.kind !== 'directory')))) {
      throw new Error('La copia contiene snapshots de lista inválidos.')
    }
  }
  for (const directory of backup.syncDirectories) {
    if (!byId.has(directory.path) || byId.get(directory.path)?.kind !== 'directory') {
      throw new Error('El checkpoint hace referencia a una carpeta fuera del catálogo.')
    }
  }
}
