import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalGatewayCatalogAdapter } from './catalog-adapter'

describe('LocalGatewayCatalogAdapter failure policy', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('marks gateway timeouts as non-retryable and deferrable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(504, 'El origen tardó demasiado.')))

    await expect(new LocalGatewayCatalogAdapter().listDirectory('/slow/'))
      .rejects.toMatchObject({ message: 'El origen tardó demasiado.', retryable: false, deferSync: true })
  })

  it('does not defer permanent directory errors as if they were timeouts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404, 'No existe.')))

    await expect(new LocalGatewayCatalogAdapter().listDirectory('/missing/'))
      .rejects.toMatchObject({ message: 'No existe.', retryable: false, deferSync: false })
  })

  it('keeps transient server errors retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(503, 'Servicio no disponible.')))

    await expect(new LocalGatewayCatalogAdapter().listDirectory('/busy/'))
      .rejects.toMatchObject({ message: 'Servicio no disponible.', retryable: true })
  })
})

function response(status: number, error: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error }),
  } as Response
}
