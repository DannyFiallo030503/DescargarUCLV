import { createReadStream, existsSync, statSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, platform } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseApacheIndex } from './parse-apache-index.mjs'
import { DownloadManager } from './download-manager.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = join(projectRoot, 'dist')
const sourceOrigin = 'https://visuales.uclv.cu'
const sourceRoot = `${sourceOrigin}/`
const remoteAppOrigins = new Set(['https://uclv-media.vercel.app'])
const port = Number(process.env.UCLV_PORT || 4179)
const requestTimeoutMs = 15_000
const maxListingBytes = 16 * 1024 * 1024
const stateRoot = process.env.XDG_STATE_HOME || (platform() === 'win32'
  ? join(process.env.APPDATA || homedir(), 'Descargar UCLV')
  : platform() === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'Descargar UCLV') : join(homedir(), '.local', 'state', 'descargar-uclv'))
const downloadDestination = resolve(process.env.UCLV_DOWNLOAD_DIR || join(homedir(), 'Downloads', 'Descargar UCLV'))
const downloadManager = new DownloadManager({
  stateFile: join(stateRoot, 'downloads.json'),
  destination: downloadDestination,
})
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'], ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
])

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function applyBrowserAccess(request, response) {
  const origin = request.headers.origin
  if (!origin) return false
  let parsed
  try { parsed = new URL(origin) } catch { return false }
  const localOrigin = ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  if (!localOrigin && !remoteAppOrigins.has(parsed.origin)) return false
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-UCLV-Request, Range, If-Range')
    response.setHeader('Access-Control-Max-Age', '600')
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
    response.writeHead(204)
    response.end()
    return true
  }
  return false
}

async function readJson(request, maxBytes = 2 * 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBytes) throw new Error('La solicitud supera el límite permitido.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new Error('El contenido JSON no es válido.') }
}

function validateLocalMutation(request) {
  const origin = request.headers.origin
  if (!origin) throw new Error('Falta el origen local de la solicitud.')
  const parsed = new URL(origin)
  if (!['http:', 'https:'].includes(parsed.protocol)
    || (!['127.0.0.1', 'localhost'].includes(parsed.hostname) && !remoteAppOrigins.has(parsed.origin))) {
    throw new Error('Solo se aceptan cambios desde la aplicación local.')
  }
  if (request.headers['x-uclv-request'] !== '1' || !(request.headers['content-type'] || '').includes('application/json')) {
    throw new Error('La solicitud local no pasó la validación del navegador.')
  }
}

function sourcePath(rawPath) {
  if (!rawPath || !rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\')) {
    throw new Error('La ruta del origen no es válida.')
  }
  const parts = rawPath.split('/').filter(Boolean).map((part) => {
    let decoded
    try { decoded = decodeURIComponent(part) } catch { throw new Error('La ruta contiene codificación inválida.') }
    if (!decoded || decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f]/.test(decoded)) {
      throw new Error('La ruta contiene un segmento no permitido.')
    }
    return encodeURIComponent(decoded).replaceAll('%3A', ':')
  })
  if (parts.length === 0) return '/'
  return `/${parts.join('/')}${rawPath.endsWith('/') ? '/' : ''}`
}

function sameSource(urlValue) {
  const url = new URL(urlValue)
  if (url.protocol !== 'https:' || url.hostname !== 'visuales.uclv.cu' || url.port) {
    throw new Error('El origen redirigió fuera del host permitido.')
  }
  return url
}

async function fetchAllowed(url, options) {
  let current = url
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, { ...options, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location || redirects === 3) throw new Error('El origen redirigió demasiadas veces.')
    current = sameSource(new URL(location, current).href)
  }
  throw new Error('El origen redirigió demasiadas veces.')
}

async function fetchListing(path) {
  const safePath = sourcePath(path)
  const url = new URL(safePath, sourceRoot)
  const controller = new AbortController()
  let timedOut = false
  const armTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => { timedOut = true; controller.abort() }, requestTimeoutMs)
  }
  let timer = setTimeout(() => { timedOut = true; controller.abort() }, requestTimeoutMs)
  try {
    const upstream = await fetchAllowed(url, {
      headers: { accept: 'text/html', 'user-agent': 'DescargarUCLV/0.1 (personal)' },
      signal: controller.signal,
    })
    sameSource(upstream.url)
    const contentType = upstream.headers.get('content-type') || ''
    if (!upstream.ok) return { status: upstream.status }
    if (!contentType.toLowerCase().includes('html')) throw new Error('El origen no devolvió un listado HTML.')
    const reader = upstream.body?.getReader()
    if (!reader) throw new Error('El origen devolvió una respuesta vacía.')
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      armTimeout()
      total += value.byteLength
      if (total > maxListingBytes) {
        controller.abort()
        throw new Error('El listado supera el límite local de 16 MiB.')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return { status: upstream.status, entries: parseApacheIndex(html, url.href) }
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`El origen no respondió al listado en ${requestTimeoutMs / 1_000} segundos. Se conserva el checkpoint; puedes reintentar.`)
      timeoutError.statusCode = 504
      timeoutError.retryable = false
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function proxyFile(request, response, url) {
  const path = sourcePath(url.searchParams.get('path') || '')
  const upstreamUrl = new URL(path, sourceRoot)
  const headers = { 'user-agent': 'DescargarUCLV/0.1 (personal)' }
  const range = request.headers.range
  const ifRange = request.headers['if-range']
  if (range) headers.range = range
  if (ifRange) headers['if-range'] = ifRange
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  response.on('close', () => { if (!response.writableFinished) controller.abort() })
  try {
    const upstream = await fetchAllowed(upstreamUrl, { headers, signal: controller.signal, method: request.method })
    sameSource(upstream.url)
    const passthrough = {}
    for (const name of ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name)
      if (value) passthrough[name] = value
    }
    passthrough['cache-control'] = 'no-store'
    passthrough['x-content-type-options'] = 'nosniff'
    response.writeHead(upstream.status, passthrough)
    if (request.method === 'HEAD' || !upstream.body) return response.end()
    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), requestTimeoutMs)
      if (!response.write(value)) await new Promise((resolveDrain) => response.once('drain', resolveDrain))
    }
    response.end()
  } catch (error) {
    if (!response.headersSent && !response.destroyed) sendJson(response, 502, { error: 'No se pudo leer el archivo del origen.' })
    else response.destroy(error)
  } finally {
    clearTimeout(timer)
  }
}

function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const file = resolve(distRoot, requested)
  if (file !== distRoot && !file.startsWith(`${distRoot}${sep}`)) return sendJson(response, 403, { error: 'Ruta no permitida.' })
  const target = existsSync(file) && statSync(file).isFile() ? file : join(distRoot, 'index.html')
  if (!existsSync(target)) return sendJson(response, 404, { error: 'La app aún no está compilada. Ejecuta npm run build.' })
  const stat = statSync(target)
  response.writeHead(200, {
    'content-type': mimeTypes.get(extname(target)) || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': pathname === '/' || pathname === '/index.html' || pathname === '/sw.js'
      ? 'no-cache'
      : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  if (request.method === 'HEAD') return response.end()
  createReadStream(target).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    if (applyBrowserAccess(request, response)) return
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (url.pathname === '/api/health') return sendJson(response, 200, { ok: true, source: sourceOrigin })
    if (url.pathname === '/api/downloads' && request.method === 'GET') {
      const jobs = downloadManager.snapshot()
      const destinations = [...new Set([downloadManager.destination, ...jobs.map((job) => job.destination || downloadManager.destination)])]
      const freeByDestination = new Map()
      await Promise.all(destinations.map(async (destination) => {
        try {
          const usage = await statfs(destination)
          freeByDestination.set(destination, Number(usage.bavail) * Number(usage.bsize))
        } catch { /* A disconnected destination is reported without a stale space value. */ }
      }))
      return sendJson(response, 200, {
        destination: downloadManager.destination,
        freeBytes: freeByDestination.get(downloadManager.destination) ?? 0,
        jobs: jobs.map((job) => ({
          ...job,
          destinationFreeBytes: freeByDestination.get(job.destination || downloadManager.destination),
        })),
      })
    }
    if (url.pathname === '/api/destination' && request.method === 'POST') {
      validateLocalMutation(request)
      const body = await readJson(request)
      const destination = await downloadManager.setDestination(body.destination)
      const usage = await statfs(destination)
      return sendJson(response, 200, { destination, freeBytes: Number(usage.bavail) * Number(usage.bsize) })
    }
    if (url.pathname === '/api/downloads' && request.method === 'POST') {
      validateLocalMutation(request)
      const body = await readJson(request)
      const job = await downloadManager.enqueue(body.items)
      return sendJson(response, 202, { job })
    }
    const jobAction = /^\/api\/downloads\/([0-9a-f-]+)\/(pause|resume)$/.exec(url.pathname)
    if (jobAction && request.method === 'POST') {
      validateLocalMutation(request)
      const changed = jobAction[2] === 'pause'
        ? await downloadManager.pause(jobAction[1])
        : await downloadManager.resume(jobAction[1])
      return sendJson(response, changed ? 200 : 409, { changed, jobs: downloadManager.snapshot() })
    }
    const jobDelete = /^\/api\/downloads\/([0-9a-f-]+)$/.exec(url.pathname)
    if (jobDelete && request.method === 'DELETE') {
      validateLocalMutation(request)
      const changed = await downloadManager.remove(jobDelete[1])
      return sendJson(response, changed ? 200 : 409, { changed, jobs: downloadManager.snapshot() })
    }
    if (url.pathname === '/api/list' && request.method === 'GET') {
      const result = await fetchListing(url.searchParams.get('path') || '/')
      if (result.status !== 200) return sendJson(response, result.status, { error: `El origen respondió HTTP ${result.status}.` })
      return sendJson(response, 200, { path: sourcePath(url.searchParams.get('path') || '/'), entries: result.entries })
    }
    if (url.pathname === '/api/file' && ['GET', 'HEAD'].includes(request.method || '')) return proxyFile(request, response, url)
    if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(request, response, url.pathname)
    return sendJson(response, 405, { error: 'Método no permitido.' })
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 400
    return sendJson(response, status, { error: error instanceof Error ? error.message : 'Solicitud no válida.' })
  }
})

void downloadManager.init().then(() => server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Descargar UCLV gateway escuchando en http://127.0.0.1:${port}\n`)
})).catch((error) => {
  process.stderr.write(`No se pudo iniciar el motor de descargas: ${error.message}\n`)
  process.exitCode = 1
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void downloadManager.shutdown().finally(() => server.close(() => process.exit(0)))
  })
}
