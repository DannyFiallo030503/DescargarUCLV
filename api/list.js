import { parseApacheIndex } from '../src/domain/apache-index.mjs'

const ORIGIN = 'https://visuales.uclv.cu'

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

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9_000)
  try {
    const path = safePath(request.query.path || '/')
    const url = new URL(path, ORIGIN)
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'text/html', 'user-agent': 'UCLV-Media/1.0 (personal catalog)' }, redirect: 'error' })
    if (!upstream.ok) return response.status(upstream.status).json({ error: `El origen respondió HTTP ${upstream.status}.` })
    if (!(upstream.headers.get('content-type') || '').toLowerCase().includes('html')) return response.status(502).json({ error: 'El origen no devolvió un índice HTML.' })
    const html = await upstream.text()
    if (Buffer.byteLength(html, 'utf8') > 8 * 1024 * 1024) return response.status(413).json({ error: 'El índice supera el límite permitido.' })
    response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    return response.status(200).json({ entries: parseApacheIndex(html, url.href) })
  } catch (error) {
    const timeoutError = error?.name === 'AbortError'
    return response.status(timeoutError ? 504 : 502).json({ error: timeoutError ? 'El origen tardó demasiado. El índice guardado se conserva; puedes reintentar.' : error instanceof Error ? error.message : 'No se pudo consultar el catálogo.' })
  } finally { clearTimeout(timeout) }
}
