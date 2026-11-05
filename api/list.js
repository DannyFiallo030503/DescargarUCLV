import { parseApacheIndex } from '../src/domain/apache-index.mjs'

const ORIGIN = 'https://visuales.uclv.cu'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

async function fetchUclv(startUrl, options) {
  let currentUrl = startUrl
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(currentUrl, { ...options, redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(response.status)) return { response, finalUrl: currentUrl }
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects === 3) throw new Error('El origen redirigió demasiadas veces.')
    const nextUrl = new URL(location, currentUrl)
    if (nextUrl.protocol !== 'https:' || nextUrl.origin !== ORIGIN) {
      const error = new Error('El origen intentó redirigir fuera de visuales.uclv.cu.')
      Object.assign(error, { networkRedirect: { status: response.status, origin: nextUrl.origin } })
      throw error
    }
    currentUrl = nextUrl
  }
  throw new Error('El origen redirigió demasiadas veces.')
}

function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) throw new Error('La ruta del catálogo no es válida.')
  const parts = value.split('/').filter(Boolean).map((part) => {
    // Vercel's request query has already decoded `path` once. Keep literal
    // percent characters in filenames and encode them only for the upstream URL.
    const decoded = part
    if (!decoded || decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f]/.test(decoded)) throw new Error('La ruta contiene un segmento no permitido.')
    return encodeURIComponent(decoded).replaceAll('%3A', ':')
  })
  return parts.length ? `/${parts.join('/')}${value.endsWith('/') ? '/' : ''}` : '/'
}

function networkDiagnostic(error) {
  const result = []
  const pending = [error]
  const seen = new Set()
  while (pending.length && result.length < 6) {
    const current = pending.shift()
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) continue
    seen.add(current)
    const row = {}
    if (typeof current.name === 'string') row.name = current.name.slice(0, 80)
    if (typeof current.code === 'string' && /^[A-Z0-9_]+$/.test(current.code)) row.code = current.code
    if (typeof current.message === 'string') row.message = current.message.slice(0, 240)
    if (current.networkRedirect) row.networkRedirect = current.networkRedirect
    result.push(row)
    if (current.cause) pending.push(current.cause)
    if (Array.isArray(current.errors)) pending.push(...current.errors)
  }
  return result
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9_000)
  try {
    const path = safePath(request.query.path || '/')
    const url = new URL(path, ORIGIN)
    const { response: upstream, finalUrl } = await fetchUclv(url, { signal: controller.signal, headers: { accept: 'text/html', 'user-agent': 'UCLV-Media/1.0 (personal catalog)' } })
    if (!upstream.ok) return response.status(upstream.status).json({ error: `El origen respondió HTTP ${upstream.status}.` })
    if (!(upstream.headers.get('content-type') || '').toLowerCase().includes('html')) return response.status(502).json({ error: 'El origen no devolvió un índice HTML.' })
    const html = await upstream.text()
    if (Buffer.byteLength(html, 'utf8') > 8 * 1024 * 1024) return response.status(413).json({ error: 'El índice supera el límite permitido.' })
    response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    return response.status(200).json({ entries: parseApacheIndex(html, finalUrl.href) })
  } catch (error) {
    const timeoutError = error?.name === 'AbortError'
    const errorCode = error?.cause?.code || error?.code
    const safeCode = typeof errorCode === 'string' && /^[A-Z0-9_]+$/.test(errorCode)
      ? errorCode
      : undefined
    const message = timeoutError
      ? 'El origen tardó demasiado. El índice guardado se conserva; puedes reintentar.'
      : error instanceof Error ? error.message : 'No se pudo consultar el catálogo.'
    const debug = request.query.diagnostic === 'network' ? { networkDiagnostic: networkDiagnostic(error) } : {}
    return response.status(timeoutError ? 504 : 502).json({ error: message, ...(safeCode ? { code: safeCode } : {}), ...debug })
  } finally { clearTimeout(timeout) }
}
