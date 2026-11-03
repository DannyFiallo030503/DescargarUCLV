export interface BrowserStorageInfo {
  supported: boolean
  persistent: boolean | null
  usageBytes?: number
  quotaBytes?: number
}

export interface BrowserStorageApi {
  persist?: () => Promise<boolean>
  persisted?: () => Promise<boolean>
  estimate?: () => Promise<StorageEstimate>
}

function currentStorage(): BrowserStorageApi | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage
}

async function inspect(storage = currentStorage(), persistent?: boolean): Promise<BrowserStorageInfo> {
  if (!storage) return { supported: false, persistent: null }
  const [persisted, estimate] = await Promise.allSettled([
    persistent === undefined ? storage.persisted?.() : Promise.resolve(persistent),
    storage.estimate?.(),
  ])
  const quota = estimate.status === 'fulfilled' ? estimate.value : undefined
  return {
    supported: Boolean(storage.persist || storage.persisted),
    persistent: persisted.status === 'fulfilled' ? persisted.value ?? null : null,
    ...(quota?.usage === undefined ? {} : { usageBytes: quota.usage }),
    ...(quota?.quota === undefined ? {} : { quotaBytes: quota.quota }),
  }
}

export function inspectBrowserStorage(storage = currentStorage()): Promise<BrowserStorageInfo> {
  return inspect(storage)
}

export async function requestPersistentStorage(storage = currentStorage()): Promise<BrowserStorageInfo> {
  if (!storage) return { supported: false, persistent: null }
  try {
    const persistent = storage.persist ? await storage.persist() : await storage.persisted?.()
    return inspect(storage, persistent ?? false)
  } catch {
    return inspect(storage, false)
  }
}
