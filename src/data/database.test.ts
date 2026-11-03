import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { fixtureCatalog, fixtureRoot } from '@/domain/fixtures'
import { favoritesRepository, listsRepository } from './database'

describe('IndexedDB v1 to v2 migration', () => {
  it('adds stable favorite and list-item snapshots without discarding existing records', async () => {
    const file = fixtureCatalog.find((node) => node.kind === 'file')!
    const openRequest = indexedDB.open('descargar-uclv', 1)
    openRequest.onupgradeneeded = () => {
      const db = openRequest.result
      const catalog = db.createObjectStore('catalog', { keyPath: 'id' })
      catalog.createIndex('by-parent', 'parentId')
      catalog.createIndex('by-kind', 'kind')
      db.createObjectStore('favorites', { keyPath: 'id' })
      db.createObjectStore('lists', { keyPath: 'id' })
      db.createObjectStore('settings', { keyPath: 'key' })
      const directories = db.createObjectStore('syncDirectories', { keyPath: 'path' })
      directories.createIndex('by-status', 'status')
    }
    const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result)
      openRequest.onerror = () => reject(openRequest.error)
    })
    const tx = legacyDb.transaction(['catalog', 'favorites', 'lists'], 'readwrite')
    tx.objectStore('catalog').put(fixtureRoot)
    tx.objectStore('catalog').put(file)
    tx.objectStore('favorites').put({ id: file.id, savedAt: 123 })
    tx.objectStore('lists').put({ id: 'legacy-list', name: 'Lista previa', itemIds: [file.id], updatedAt: 123 })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    legacyDb.close()

    const [favorites, lists] = await Promise.all([favoritesRepository.all(), listsRepository.all()])
    expect(favorites).toHaveLength(1)
    expect(favorites[0].snapshot).toMatchObject({ id: file.id, name: file.name, relativePath: file.relativePath })
    expect(lists).toHaveLength(1)
    expect(lists[0].itemSnapshots?.[file.id]).toMatchObject({ name: file.name, relativePath: file.relativePath })
  })
})
