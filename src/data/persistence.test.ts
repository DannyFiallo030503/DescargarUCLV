import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { catalogRepository, type SyncState } from './database'
import type { CatalogNode } from '@/domain/catalog'

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('persistencia del índice y su checkpoint', () => {
  it('conserva lo confirmado y deja pendiente solo lo que falta tras reabrir IndexedDB', async () => {
    await catalogRepository.ensureFixture()
    const folder: CatalogNode = {
      id: '/Anime/', parentId: '/', parentPath: '/', relativePath: '/Anime/', name: 'Anime', kind: 'directory',
    }
    const episode: CatalogNode = {
      id: '/Anime/01.mp4', parentId: '/Anime/', parentPath: '/Anime/', relativePath: '/Anime/01.mp4',
      name: '01.mp4', kind: 'file', sizeBytes: 456,
    }
    const season: CatalogNode = {
      id: '/Anime/Season 1/', parentId: '/Anime/', parentPath: '/Anime/', relativePath: '/Anime/Season 1/',
      name: 'Season 1', kind: 'directory',
    }
    const checkpoint: SyncState = { phase: 'running', directoriesDone: 1, filesFound: 0 }
    await catalogRepository.commitDirectory('/', [folder], checkpoint)
    await catalogRepository.commitDirectory('/Anime/', [episode, season], {
      phase: 'paused', directoriesDone: 2, filesFound: 1,
    })

    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('descargar-uclv', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = reopened.transaction(['catalog', 'settings', 'syncDirectories'], 'readonly')
    const [catalog, state, pending] = await Promise.all([
      requestValue(tx.objectStore('catalog').getAll()),
      requestValue(tx.objectStore('settings').get('sync-state')),
      requestValue(tx.objectStore('syncDirectories').index('by-status').getAll('pending')),
    ])
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    reopened.close()

    expect(catalog).toContainEqual(episode)
    expect(state?.value).toMatchObject({ phase: 'paused', directoriesDone: 2, filesFound: 1 })
    expect(pending.map((directory) => directory.path)).toEqual(['/Anime/Season 1/'])
  })
})
