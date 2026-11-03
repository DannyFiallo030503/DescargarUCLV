import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { catalogRepository } from '@/data/database'
import type { CatalogNode } from '@/domain/catalog'
import { CatalogSyncService } from './catalog-sync'

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  if (!predicate()) throw new Error('La sincronización no alcanzó el estado esperado.')
}

describe('CatalogSyncService', () => {
  it('ignora una segunda orden de inicio mientras ya existe una corrida activa', async () => {
    await catalogRepository.ensureFixture()
    let calls = 0
    let release!: () => void
    const adapter = {
      listDirectory: async (_path: string, signal?: AbortSignal): Promise<CatalogNode[]> => {
        calls += 1
        await new Promise<void>((resolve, reject) => {
          release = resolve
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
        return []
      },
    }
    const service = new CatalogSyncService(adapter)
    const first = service.run(() => {})
    await waitUntil(() => calls === 1)
    const duplicate = service.run(() => {})
    release()
    const [firstState, duplicateState] = await Promise.all([first, duplicate])

    expect(calls).toBe(1)
    expect(firstState.phase).toBe('complete')
    expect(duplicateState).toBe(firstState)
  })

  it('reanuda desde la última carpeta confirmada después de pausar', async () => {
    await catalogRepository.ensureFixture()
    let firstFileRequestStarted!: () => void
    const firstFileStarted = new Promise<void>((resolve) => { firstFileRequestStarted = resolve })
    let firstFileRequestSeen = false
    const folder: CatalogNode = {
      id: '/one/', parentId: '/', parentPath: '/', relativePath: '/one/', name: 'one', kind: 'directory',
    }
    const file: CatalogNode = {
      id: '/one/episode.mp4', parentId: '/one/', parentPath: '/one/', relativePath: '/one/episode.mp4',
      name: 'episode.mp4', kind: 'file', sizeBytes: 123,
    }
    const adapter = {
      listDirectory: async (path: string, signal?: AbortSignal): Promise<CatalogNode[]> => {
        if (path === '/') return [folder]
        if (!firstFileRequestSeen) {
          firstFileRequestSeen = true
          firstFileRequestStarted()
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
        }
        return [file]
      },
    }
    const committed: CatalogNode[][] = []
    const service = new CatalogSyncService(adapter, (entries) => committed.push(entries))
    const firstRun = service.run(() => {})
    await firstFileStarted
    service.pause()
    const paused = await firstRun
    expect(paused).toMatchObject({ phase: 'paused', directoriesDone: 1, filesFound: 0 })

    const resumed = await service.run(() => {})
    expect(resumed).toMatchObject({ phase: 'complete', directoriesDone: 2, filesFound: 1 })
    expect(await catalogRepository.children('/one/')).toContainEqual(file)
    expect(committed.flat()).toEqual([folder, file])
  })

  it('cancela el reintento durante la espera y reanuda sin repetir esperas', async () => {
    await catalogRepository.ensureFixture()
    let calls = 0
    const adapter = {
      listDirectory: async (): Promise<CatalogNode[]> => {
        calls += 1
        if (calls === 1) throw new Error('conexión interrumpida')
        return []
      },
    }
    const service = new CatalogSyncService(adapter)
    const firstRun = service.run(() => {})
    await waitUntil(() => calls === 1)
    await new Promise((resolve) => setTimeout(resolve, 25))
    service.pause()

    const paused = await firstRun
    expect(paused.phase).toBe('paused')
    expect(calls).toBe(1)
    expect((await service.run(() => {})).phase).toBe('complete')
    expect(calls).toBe(2)
  })

  it('aparca el timeout y continúa con las demás carpetas sin repetir la espera larga', async () => {
    await catalogRepository.ensureFixture()
    let calls = 0
    const rootFolder: CatalogNode = {
      id: '/root-folder/', parentId: '/', parentPath: '/', relativePath: '/root-folder/', name: 'root-folder', kind: 'directory',
    }
    const slowFolder: CatalogNode = {
      id: '/root-folder/slow/', parentId: '/root-folder/', parentPath: '/root-folder/', relativePath: '/root-folder/slow/', name: 'slow', kind: 'directory',
    }
    const fastFolder: CatalogNode = {
      id: '/root-folder/fast/', parentId: '/root-folder/', parentPath: '/root-folder/', relativePath: '/root-folder/fast/', name: 'fast', kind: 'directory',
    }
    const file: CatalogNode = {
      id: '/root-folder/fast/ok.mp4', parentId: '/root-folder/fast/', parentPath: '/root-folder/fast/', relativePath: '/root-folder/fast/ok.mp4', name: 'ok.mp4', kind: 'file', sizeBytes: 20,
    }
    const callsByPath = new Map<string, number>()
    const adapter = {
      listDirectory: async (path: string): Promise<CatalogNode[]> => {
        calls += 1
        callsByPath.set(path, (callsByPath.get(path) ?? 0) + 1)
        if (path === '/') return [rootFolder]
        if (path === '/root-folder/') return [slowFolder, fastFolder]
        if (path === '/root-folder/slow/' && callsByPath.get(path) === 1) {
          throw Object.assign(new Error('El origen no respondió al listado en 15 segundos.'), { retryable: false, deferSync: true })
        }
        if (path === '/root-folder/fast/') return [file]
        return []
      },
    }
    const service = new CatalogSyncService(adapter)

    const failed = await service.run(() => {})

    expect(calls).toBe(4)
    expect(failed).toMatchObject({
      phase: 'partial',
      directoriesDone: 3,
      filesFound: 1,
      deferredDirectories: 1,
      lastError: 'El origen no respondió al listado en 15 segundos.',
    })
    expect(callsByPath.get('/root-folder/slow/')).toBe(1)
    expect(await catalogRepository.children('/root-folder/fast/')).toContainEqual(file)

    const resumed = await service.run(() => {})
    expect(resumed).toMatchObject({ phase: 'complete', directoriesDone: 4, filesFound: 1 })
    expect(callsByPath.get('/root-folder/slow/')).toBe(2)
  })
})
