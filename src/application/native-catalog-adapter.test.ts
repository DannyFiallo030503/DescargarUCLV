import { describe, expect, it, vi } from 'vitest'
import { NativeCatalogAdapter, type NativeHttpRequest } from './native-catalog-adapter'

function transport(responses: Array<{ status: number; data?: unknown; headers?: Record<string, string> }>) {
  const request = vi.fn<NativeHttpRequest>().mockImplementation(async () => {
    const next = responses.shift()
    if (!next) throw new Error('Unexpected request')
    return { data: '', ...next }
  })
  return request
}

describe('NativeCatalogAdapter', () => {
  it('parses a directory listing and maps parentId', async () => {
    const request = transport([{ status: 200, data: '<table><tr><td>[DIR]</td><td><a href="Temporada%201/">Temporada 1/</a></td><td></td><td>-</td></tr><tr><td>[VID]</td><td><a href="ep%201.mp4">ep 1.mp4</a></td><td></td><td>4M</td></tr></table>' }])
    const entries = await new NativeCatalogAdapter(request).listDirectory('/Anime/Serie/')
    expect(entries).toMatchObject([
      { id: '/Anime/Serie/Temporada 1/', parentId: '/Anime/Serie/', kind: 'directory' },
      { id: '/Anime/Serie/ep 1.mp4', parentId: '/Anime/Serie/', sizeBytes: 4 * 1024 ** 2 },
    ])
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://visuales.uclv.cu/Anime/Serie/', method: 'GET', disableRedirects: true,
      connectTimeout: 15000, readTimeout: 15000,
    }))
  })

  it('follows same-origin redirects but rejects a different host', async () => {
    const same = transport([
      { status: 301, headers: { Location: '/catalogo/' } },
      { status: 200, data: '<table></table>' },
    ])
    await expect(new NativeCatalogAdapter(same).listDirectory('/')).resolves.toEqual([])
    expect(same).toHaveBeenCalledTimes(2)

    const external = transport([{ status: 302, headers: { location: 'https://example.com/' } }])
    await expect(new NativeCatalogAdapter(external).listDirectory('/')).rejects.toThrow('fuera del catálogo')
  })

  it('marks 504 as deferred, other server failures retryable, and 404 permanent', async () => {
    for (const [status, expected] of [[504, { deferSync: true, retryable: false }], [503, { retryable: true }], [404, { retryable: false }]] as const) {
      const adapter = new NativeCatalogAdapter(transport([{ status }]))
      const error = await adapter.listDirectory('/').catch((value: unknown) => value as Error & Record<string, unknown>)
      expect(error).toMatchObject(expected)
    }
  })

  it('parks native HTTP timeouts for manual retry instead of repeating a slow listing', async () => {
    const request = vi.fn<NativeHttpRequest>().mockRejectedValue(new Error('Read timed out'))
    const error = await new NativeCatalogAdapter(request).listDirectory('/').catch((value: unknown) => value as Error & Record<string, unknown>)
    expect(error).toMatchObject({ deferSync: true, retryable: false })
    expect((error as Error).message).toContain('reintento manual')
  })

  it('checks connectivity with a HEAD request and supports cancellation', async () => {
    const request = transport([{ status: 204 }])
    await expect(new NativeCatalogAdapter(request).checkConnection()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'HEAD', url: 'https://visuales.uclv.cu/' }))
    const controller = new AbortController()
    controller.abort()
    await expect(new NativeCatalogAdapter(request).listDirectory('/', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
