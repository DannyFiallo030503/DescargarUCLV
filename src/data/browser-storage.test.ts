import { describe, expect, it, vi } from 'vitest'
import { inspectBrowserStorage, requestPersistentStorage, type BrowserStorageApi } from './browser-storage'

function fakeStorage(values: Partial<BrowserStorageApi> = {}): BrowserStorageApi {
  return {
    persist: vi.fn(async () => true),
    persisted: vi.fn(async () => false),
    estimate: vi.fn(async () => ({ usage: 1024, quota: 4096 })),
    ...values,
  }
}

describe('browser persistent storage', () => {
  it('reports persistence grant and usage/quota estimates', async () => {
    const storage = fakeStorage({ persisted: vi.fn(async () => true) })
    await expect(inspectBrowserStorage(storage)).resolves.toEqual({
      supported: true, persistent: true, usageBytes: 1024, quotaBytes: 4096,
    })
  })

  it('requests persistent storage before reporting the result', async () => {
    const persist = vi.fn(async () => true)
    const storage = fakeStorage({ persist })
    await expect(requestPersistentStorage(storage)).resolves.toMatchObject({ supported: true, persistent: true })
    expect(persist).toHaveBeenCalledOnce()
  })

  it('reports a denial without hiding storage estimates', async () => {
    const storage = fakeStorage({ persist: vi.fn(async () => false) })
    await expect(requestPersistentStorage(storage)).resolves.toEqual({
      supported: true, persistent: false, usageBytes: 1024, quotaBytes: 4096,
    })
  })

  it('handles private/unsupported storage APIs and unavailable quota', async () => {
    await expect(inspectBrowserStorage(undefined)).resolves.toEqual({ supported: false, persistent: null })
    await expect(inspectBrowserStorage({})).resolves.toEqual({ supported: false, persistent: null })
  })
})
