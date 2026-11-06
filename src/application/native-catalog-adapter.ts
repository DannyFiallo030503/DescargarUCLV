import { CapacitorHttp } from '@capacitor/core'
import { parseApacheIndex } from '@/domain/apache-index.mjs'
import type { CatalogNode } from '@/domain/catalog'
import type { CatalogAdapter } from '@/application/catalog-adapter'
import { isAllowedSourceUrl, sourceUrlForPath } from '@/application/source-url'

const TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 3
const MAX_INDEX_BYTES = 16 * 1024 * 1024

export interface NativeHttpResponse { status: number; data: unknown; headers?: Record<string, string> }
export type NativeHttpRequest = (options: {
  url: string; method: 'GET' | 'HEAD'; headers: Record<string, string>; responseType: 'text';
  connectTimeout: number; readTimeout: number; disableRedirects: true
}) => Promise<NativeHttpResponse>

const capacitorRequest: NativeHttpRequest = (options) => CapacitorHttp.request(options)

export class NativeCatalogAdapter implements CatalogAdapter {
  constructor(private readonly request: NativeHttpRequest = capacitorRequest) {}

  async checkConnection(signal?: AbortSignal): Promise<boolean> {
    const response = await this.requestFollowingRedirects(sourceUrlForPath('/'), 'HEAD', signal)
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`El catálogo respondió HTTP ${response.status} al comprobar la conexión.`)
    }
    return true
  }

  async listDirectory(path: string, signal?: AbortSignal): Promise<CatalogNode[]> {
    const response = await this.requestFollowingRedirects(sourceUrlForPath(path), 'GET', signal)
    if (response.status !== 200) {
      const error = new Error(`El catálogo respondió HTTP ${response.status}.`)
      Object.assign(error, { retryable: response.status >= 500 && response.status !== 504, deferSync: response.status === 504 })
      throw error
    }
    const html = typeof response.data === 'string' ? response.data : ''
    if (new TextEncoder().encode(html).byteLength > MAX_INDEX_BYTES) {
      throw new Error('El listado supera el límite de 16 MiB y se omitió para proteger la memoria.')
    }
    return parseApacheIndex(html, sourceUrlForPath(path)).map((entry) => ({ ...entry, parentId: entry.parentPath }))
  }

  private async requestFollowingRedirects(initialUrl: string, method: 'GET' | 'HEAD', signal?: AbortSignal): Promise<NativeHttpResponse> {
    let url = initialUrl
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      if (signal?.aborted) throw new DOMException('La solicitud fue cancelada.', 'AbortError')
      let response: NativeHttpResponse
      try {
        response = await this.request({
          url, method, headers: { Accept: method === 'HEAD' ? '*/*' : 'text/html' }, responseType: 'text',
          connectTimeout: TIMEOUT_MS, readTimeout: TIMEOUT_MS, disableRedirects: true,
        })
      } catch (cause) {
        if (signal?.aborted) throw new DOMException('La solicitud fue cancelada.', 'AbortError')
        const message = cause instanceof Error ? cause.message : String(cause)
        const error = new Error(message || 'No se pudo conectar con el catálogo.')
        if (/timeout|timed out|timedout/i.test(message)) {
          error.message = 'La carpeta tardó demasiado en responder y se guardó para reintentarla.'
          Object.assign(error, { retryable: false, deferSync: true })
        } else {
          Object.assign(error, { retryable: true })
        }
        throw error
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      const location = Object.entries(response.headers ?? {}).find(([name]) => name.toLowerCase() === 'location')?.[1]
      if (!location || redirects === MAX_REDIRECTS) throw new Error('El catálogo realizó demasiadas redirecciones.')
      const next = new URL(location, url).href
      if (!isAllowedSourceUrl(next)) throw new Error('Se bloqueó una redirección fuera del catálogo UCLV.')
      url = next
    }
    throw new Error('El catálogo realizó demasiadas redirecciones.')
  }
}
