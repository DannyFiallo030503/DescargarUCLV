import type { CatalogNode } from '@/domain/catalog'

interface GatewayEntry {
  id: string
  parentPath: string
  relativePath: string
  name: string
  kind: 'directory' | 'file'
  sizeBytes?: number
  sizeLabel?: string
  sourceUrl: string
}

export interface CatalogAdapter {
  listDirectory(path: string, signal?: AbortSignal): Promise<CatalogNode[]>
}

export class LocalGatewayCatalogAdapter implements CatalogAdapter {
  async listDirectory(path: string, signal?: AbortSignal): Promise<CatalogNode[]> {
    const response = await fetch(`/api/list?path=${encodeURIComponent(path)}`, { signal, cache: 'no-store' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      const error = new Error(payload.error || `El origen respondió HTTP ${response.status}.`)
      Object.assign(error, {
        retryable: response.status >= 500 && response.status !== 504,
        deferSync: response.status === 504,
      })
      throw error
    }
    const payload = await response.json() as { entries: GatewayEntry[] }
    return payload.entries.map((entry) => ({
      ...entry,
      parentId: entry.parentPath,
    }))
  }
}
