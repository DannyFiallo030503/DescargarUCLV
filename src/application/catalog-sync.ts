import type { CatalogNode } from '@/domain/catalog'
import { catalogRepository, type SyncState } from '@/data/database'
import type { CatalogAdapter } from './catalog-adapter'

const quickRetryDelayMs = 650

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Sincronización pausada', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Sincronización pausada', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class CatalogSyncService {
  private controller?: AbortController
  private activeRun?: Promise<SyncState>

  constructor(
    private readonly adapter: CatalogAdapter,
    private readonly onDirectoryCommitted: (entries: CatalogNode[]) => void = () => {},
  ) {}

  pause(): void {
    this.controller?.abort()
    this.controller = undefined
  }

  run(onProgress: (state: SyncState) => void): Promise<SyncState> {
    if (this.activeRun && this.controller && !this.controller.signal.aborted) return this.activeRun
    if (this.activeRun) return this.activeRun.then(() => this.run(onProgress))
    const controller = new AbortController()
    this.controller = controller
    let trackedRun: Promise<SyncState>
    trackedRun = this.execute(onProgress, controller).finally(() => {
      if (this.controller === controller) this.controller = undefined
      if (this.activeRun === trackedRun) this.activeRun = undefined
    })
    this.activeRun = trackedRun
    return trackedRun
  }

  private async execute(onProgress: (state: SyncState) => void, controller: AbortController): Promise<SyncState> {
    const signal = controller.signal
    const previous = await catalogRepository.getSyncState()
    if (previous.phase === 'idle' || previous.phase === 'complete') await catalogRepository.resetSyncQueue()
    else if (previous.phase === 'partial' || (previous.phase === 'paused' && (previous.deferredDirectories ?? 0) > 0)) {
      await catalogRepository.retryDeferredDirectories()
    }
    const resumed = await catalogRepository.getSyncState()
    let directoriesDone = resumed.directoriesDone
    let filesFound = resumed.filesFound
    let deferredDirectories = resumed.deferredDirectories ?? 0
    let lastDeferredError: string | undefined
    const state: SyncState = {
      phase: 'running', directoriesDone, filesFound,
    }
    await catalogRepository.saveSyncState(state)
    onProgress(state)

    try {
      let path = await catalogRepository.nextPendingDirectory()
      while (path && !signal.aborted) {
        let entries: CatalogNode[] = []
        let lastError: unknown
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            entries = await this.adapter.listDirectory(path, signal)
            lastError = undefined
            break
          } catch (error) {
            lastError = error
            if (signal.aborted || attempt === 1 || !isRetryable(error)) break
            await delay(quickRetryDelayMs, signal)
          }
        }
        if (lastError) {
          if (!signal.aborted && isDeferrable(lastError)) {
            deferredDirectories = await catalogRepository.deferDirectory(path)
            lastDeferredError = lastError instanceof Error ? lastError.message : 'No se pudo leer una carpeta.'
            const checkpoint: SyncState = {
              phase: 'running', directoriesDone, filesFound, deferredDirectories, lastError: lastDeferredError,
            }
            await catalogRepository.saveSyncState(checkpoint)
            onProgress(checkpoint)
            path = await catalogRepository.nextPendingDirectory()
            continue
          }
          throw lastError
        }
        directoriesDone += 1
        filesFound += entries.filter((entry) => entry.kind === 'file').length
        const checkpoint: SyncState = {
          phase: 'running', directoriesDone, filesFound,
        }
        await catalogRepository.commitDirectory(path, entries, checkpoint)
        this.onDirectoryCommitted(entries)
        onProgress(checkpoint)
        path = await catalogRepository.nextPendingDirectory()
      }
      const finalState: SyncState = signal.aborted
        ? { phase: 'paused', directoriesDone, filesFound, deferredDirectories, lastError: lastDeferredError }
        : deferredDirectories > 0
          ? { phase: 'partial', directoriesDone, filesFound, deferredDirectories, lastError: lastDeferredError }
          : { phase: 'complete', directoriesDone, filesFound, lastCompletedAt: Date.now() }
      await catalogRepository.saveSyncState(finalState)
      onProgress(finalState)
      return finalState
    } catch (error) {
      const failedState: SyncState = {
        phase: signal.aborted ? 'paused' : 'error',
        directoriesDone,
        filesFound,
        lastError: storageFailureMessage(error),
      }
      await catalogRepository.saveSyncState(failedState)
      onProgress(failedState)
      return failedState
    }
  }
}

function storageFailureMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error
    && error.name === 'QuotaExceededError') {
    return 'El navegador no tiene espacio suficiente para guardar más índice. Libera espacio o crea una copia de seguridad; el avance anterior se conserva.'
  }
  return error instanceof Error ? error.message : 'No se pudo guardar el índice.'
}

function isRetryable(error: unknown): boolean {
  if (error && typeof error === 'object' && 'retryable' in error) {
    return (error as { retryable?: unknown }).retryable !== false
  }
  return true
}

function isDeferrable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'deferSync' in error
    && (error as { deferSync?: unknown }).deferSync === true)
}
