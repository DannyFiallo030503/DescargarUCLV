import { createServer, request as httpRequest } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const appOrigins = new Set([
  'https://uclv-media.vercel.app',
  'https://localhost',
  'capacitor://localhost',
])
const accessToken = process.env.UCLV_ACCESS_TOKEN || randomBytes(32).toString('base64url')
const port = Number(process.env.UCLV_REMOTE_PORT || 4180)
const gatewayPort = Number(process.env.UCLV_PORT || 4179)
const mediaTickets = new Map()
const mediaTicketLifetimeMs = 15 * 60 * 1000
const allowedPath = /^\/api\/(?:health|list|file|downloads|destination|downloads\/[a-zA-Z0-9-]+(?:\/(?:pause|resume))?|mobile-ticket)$/

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

function applyCors(request, response) {
  const origin = request.headers.origin
  if (!origin || !appOrigins.has(origin)) return false
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-UCLV-Request, X-UCLV-Access, Range, If-Range')
  response.setHeader('Access-Control-Max-Age', '600')
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return true
  }
  return false
}

function validToken(candidate) {
  if (typeof candidate !== 'string') return false
  const expected = Buffer.from(accessToken)
  const supplied = Buffer.from(candidate)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8 * 1024) throw new Error('La solicitud supera el límite permitido.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function validCatalogPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false
  return path.split('/').filter(Boolean).every((segment) => {
    return segment !== '.' && segment !== '..' && !/[/\\\u0000-\u001f]/.test(segment)
  })
}

function createMediaTicket(path) {
  const ticket = randomBytes(24).toString('base64url')
  mediaTickets.set(ticket, { path, expiresAt: Date.now() + mediaTicketLifetimeMs })
  if (mediaTickets.size > 1000) {
    const now = Date.now()
    for (const [key, value] of mediaTickets) if (value.expiresAt <= now) mediaTickets.delete(key)
  }
  return ticket
}

function proxy(request, response, url) {
  const target = new URL(url)
  const headers = { ...request.headers, host: `127.0.0.1:${gatewayPort}` }
  delete headers['x-uclv-access']
  delete headers.connection
  const upstream = httpRequest({ hostname: '127.0.0.1', port: gatewayPort, method: request.method, path: target.pathname + target.search, headers }, (upstreamResponse) => {
    const passthrough = {}
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control', 'x-content-type-options']) {
      const value = upstreamResponse.headers[key]
      if (value !== undefined) passthrough[key] = value
    }
    if (target.searchParams.get('download') === '1' && upstreamResponse.statusCode === 200) {
      const rawName = target.searchParams.get('name') || 'descarga'
      const safeName = rawName.replace(/[\r\n"\\]/g, '_').slice(0, 180)
      passthrough['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`
    }
    response.writeHead(upstreamResponse.statusCode || 502, passthrough)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', (error) => {
    if (!response.headersSent) sendJson(response, 502, { error: `El gateway local no respondió: ${error.message}` })
    else response.destroy(error)
  })
  request.pipe(upstream)
}

createServer(async (request, response) => {
  if (applyCors(request, response)) return
  if (request.url.length > 8192) return sendJson(response, 414, { error: 'La ruta supera el límite permitido.' })
  const url = new URL(request.url, 'http://remote-gateway.local')
  if (!allowedPath.test(url.pathname)) return sendJson(response, 404, { error: 'Ruta no disponible a través del puente móvil.' })

  if (url.pathname === '/api/file' && ['GET', 'HEAD'].includes(request.method)) {
    const path = url.searchParams.get('path') || ''
    const ticket = mediaTickets.get(url.searchParams.get('ticket') || '')
    if (!ticket || ticket.expiresAt <= Date.now() || ticket.path !== path || !validCatalogPath(path)) {
      return sendJson(response, 401, { error: 'El permiso de vista previa venció. Vuelve a abrir el archivo.' })
    }
    url.searchParams.delete('ticket')
    return proxy(request, response, url)
  }

  if (!validToken(request.headers['x-uclv-access'])) {
    return sendJson(response, 401, { error: 'Clave del gateway inválida o ausente.' })
  }

  if (url.pathname === '/api/mobile-ticket' && request.method === 'POST') {
    try {
      const body = await readJson(request)
      if (!validCatalogPath(body.path)) return sendJson(response, 400, { error: 'La ruta del archivo no es válida.' })
      return sendJson(response, 200, { ticket: createMediaTicket(body.path), expiresAt: Date.now() + mediaTicketLifetimeMs })
    } catch {
      return sendJson(response, 400, { error: 'No se pudo preparar la vista previa.' })
    }
  }

  url.searchParams.delete('ticket')
  return proxy(request, response, url)
}).listen(port, '127.0.0.1', () => {
  console.info(`Gateway móvil activo en http://127.0.0.1:${port}`)
  console.info(`Clave temporal del gateway: ${accessToken}`)
  console.info('La clave se renueva al reiniciar; comparte solo con tus dispositivos.')
})
