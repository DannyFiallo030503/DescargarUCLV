import type { CatalogNode } from '@/domain/catalog'
import type { CatalogAdapter } from '@/application/catalog-adapter'

interface ListingResponse { entries?: Array<Omit<CatalogNode, 'parentId'> & { parentId?: string }>; error?: string }

/** Reads the UCLV index through our same-origin, region-pinned catalog function. */
export class HostedCatalogAdapter implements CatalogAdapter {
  async listDirectory(path: string, signal?: AbortSignal): Promise<CatalogNode[]> {
    let response: Response
    try {
      const configuredEndpoint = import.meta.env.VITE_CATALOG_PROXY_URL?.trim()
      const endpoint = configuredEndpoint || `${window.location.origin}/api/list`
      const url = new URL(endpoint)
      url.searchParams.set('path', path)
      response = await fetch(url, {
        signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      })
    } catch (cause) {
      if (signal?.aborted) throw new DOMException('La solicitud fue cancelada.', 'AbortError')
      const error = new Error('No se pudo conectar con el servicio del catálogo. Comprueba la conexión e inténtalo de nuevo.')
      Object.assign(error, { cause, retryable: true })
      throw error
    }

    const payload = await response.json().catch(() => ({})) as ListingResponse
    if (!response.ok) {
      const error = new Error(payload.error || `El servicio del catálogo respondió HTTP ${response.status}.`)
      Object.assign(error, {
        retryable: response.status >= 500 && response.status !== 504,
        deferSync: response.status === 504,
      })
      throw error
    }
    if (!Array.isArray(payload.entries)) throw new Error('El servicio del catálogo devolvió una respuesta no válida.')
    return payload.entries.map((entry) => ({ ...entry, parentId: entry.parentId || entry.parentPath }))
  }
}
