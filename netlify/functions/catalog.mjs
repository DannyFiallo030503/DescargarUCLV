import { parseApacheIndex } from '../../src/domain/apache-index.mjs'

const SOURCE_ORIGIN = 'https://visuales.uclv.cu'
const SOURCE_ROOT = `${SOURCE_ORIGIN}/`
const ALLOWED_ORIGINS = new Set([
  'https://uclv-media.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 3
const MAX_LISTING_BYTES = 16 * 1024 * 1024
const TIMEOUT_MS = 25_000

function response(status, body, origin) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin',
  })
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'GET, OPTIONS')
    headers.set('access-control-max-age', '600')
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}

function safeSourceUrl(path) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('La ruta del catálogo no es válida.')
  }
  const segments = path.split('/').filter(Boolean).map((segment) => {
    if (segment === '.' || segment === '..' || /[\\\u0000-\u001f]/.test(segment)) {
      throw new Error('La ruta contiene un segmento no permitido.')
    }
    return encodeURIComponent(segment).replaceAll('%3A', ':')
  })
  const encodedPath = `/${segments.join('/')}${path.endsWith('/') && segments.length ? '/' : ''}`
  return new URL(encodedPath, SOURCE_ROOT)
}

async function fetchListing(startUrl, signal) {
  let currentUrl = startUrl
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const upstream = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        accept: 'text/html',
        'user-agent': 'UCLV-Media/1.0 (personal catalog)',
      },
    })

    if (REDIRECT_STATUSES.has(upstream.status)) {
      const location = upstream.headers.get('location')
      await upstream.body?.cancel()
      if (!location) throw Object.assign(new Error('UCLV devolvió una redirección sin destino.'), { status: 502 })
      const nextUrl = new URL(location, currentUrl)
      if (nextUrl.origin !== SOURCE_ORIGIN || nextUrl.protocol !== 'https:') {
        throw Object.assign(new Error(`UCLV intentó redirigir a ${nextUrl.hostname}; se bloqueó la redirección.`), { status: 502 })
      }
      if (redirects === MAX_REDIRECTS) throw Object.assign(new Error('UCLV realizó demasiadas redirecciones.'), { status: 502 })
      currentUrl = nextUrl
      continue
    }

    if (!upstream.ok) {
      await upstream.body?.cancel()
      throw Object.assign(new Error(`UCLV respondió HTTP ${upstream.status}.`), { status: upstream.status })
    }
    if (!(upstream.headers.get('content-type') || '').toLowerCase().includes('html')) {
      await upstream.body?.cancel()
      throw Object.assign(new Error('UCLV no devolvió un índice HTML.'), { status: 502 })
    }
    if (!upstream.body) throw Object.assign(new Error('UCLV devolvió una respuesta vacía.'), { status: 502 })

    const reader = upstream.body.getReader()
    const chunks = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_LISTING_BYTES) {
          await reader.cancel()
          throw Object.assign(new Error('El índice supera el límite de 16 MiB.'), { status: 413 })
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { html: new TextDecoder('utf-8', { fatal: false }).decode(bytes), url: currentUrl }
  }
  throw Object.assign(new Error('UCLV realizó demasiadas redirecciones.'), { status: 502 })
}

export default async (request) => {
  const origin = request.headers.get('origin') || ''
  if (request.method === 'OPTIONS') return response(204, {}, origin)
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(403, { error: 'Este origen no está autorizado para consultar el catálogo.' })
  if (request.method !== 'GET') return response(405, { error: 'Método no permitido.' }, origin)

  const requestUrl = new URL(request.url)
  const path = requestUrl.searchParams.get('path') || '/'
  if (path.length > 2048) return response(414, { error: 'La ruta supera el límite permitido.' }, origin)

  let upstreamUrl
  try { upstreamUrl = safeSourceUrl(path) }
  catch (error) { return response(400, { error: error instanceof Error ? error.message : 'Ruta no válida.' }, origin) }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const { html, url } = await fetchListing(upstreamUrl, controller.signal)
    const entries = parseApacheIndex(html, url.href)
    return response(200, { path, entries }, origin)
  } catch (error) {
    const timedOut = controller.signal.aborted
    const status = timedOut ? 504 : Number.isInteger(error?.status) ? error.status : 502
    const message = timedOut
      ? 'UCLV tardó más de 25 segundos. Se conserva el avance; puedes reintentar.'
      : error instanceof Error ? error.message : 'No se pudo consultar el catálogo.'
    return response(status, { error: message }, origin)
  } finally {
    clearTimeout(timeout)
  }
}
