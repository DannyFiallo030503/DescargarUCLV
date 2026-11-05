import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let child
let baseUrl
let temporaryRoot

function request(path, options = {}) {
  return new Promise((resolveRequest, reject) => {
    const req = httpRequest(`${baseUrl}${path}`, options, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolveRequest({
        status: response.statusCode,
        headers: response.headers,
        text: () => Buffer.concat(chunks).toString('utf8'),
        json: () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }))
    })
    req.once('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function unusedPort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const { port } = server.address()
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

describe('gateway HTTP black-box contract', () => {
  beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'descargar-uclv-gateway-'))
    const port = await unusedPort()
    baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, [resolve('server/gateway.mjs')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        UCLV_PORT: String(port),
        XDG_STATE_HOME: join(temporaryRoot, 'state'),
        UCLV_DOWNLOAD_DIR: join(temporaryRoot, 'downloads'),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let lastError = ''
    child.stderr.on('data', (chunk) => { lastError += chunk.toString() })
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Gateway no iniciado: ${lastError}`)
      try {
        if ((await request('/api/health')).status === 200) return
      } catch { /* Wait for the child server to bind its local port. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25))
    }
    throw new Error(`Gateway sin respuesta: ${lastError}`)
  }, 15_000)

  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((resolveExit) => child.once('exit', resolveExit))
    }
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
  })

  it('expone salud y el origen permitido sin requerir internet', async () => {
    const response = await request('/api/health')
    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ ok: true, source: 'https://visuales.uclv.cu' })
  })

  it('autoriza únicamente el origen Vercel de la app y permite el preflight del navegador', async () => {
    const response = await request('/api/health', { headers: { origin: 'https://uclv-media.vercel.app' } })
    expect(response.headers['access-control-allow-origin']).toBe('https://uclv-media.vercel.app')

    const preflight = await request('/api/list', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://uclv-media.vercel.app',
        'access-control-request-method': 'GET',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers['access-control-allow-methods']).toContain('GET')
  })

  it('no concede CORS a sitios ajenos', async () => {
    const response = await request('/api/health', { headers: { origin: 'https://sitio-ajeno.example' } })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('evita que el navegador conserve index y service worker antiguos tras una actualización', async () => {
    const index = await request('/')
    const worker = await request('/sw.js')
    expect(index.headers['cache-control']).toBe('no-cache')
    expect(worker.headers['cache-control']).toBe('no-cache')
    expect(index.text()).toContain('/assets/index-')
  })

  it('expone destino local y capacidad comprobable', async () => {
    const response = await request('/api/downloads')
    const body = response.json()
    expect(response.status).toBe(200)
    expect(body.destination).toBe(join(temporaryRoot, 'downloads'))
    expect(body.freeBytes).toBeGreaterThan(0)
    expect(body.jobs).toEqual([])
  })

  it('rechaza cambios sin las cabeceras de origen local antes de escribir', async () => {
    const response = await request('/api/downloads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    expect(response.status).toBe(400)
    expect(response.json()).toMatchObject({ error: expect.stringContaining('origen local') })
  })

  it('permite que la app publicada gestione el destino pasando la misma validación de cambios', async () => {
    const response = await request('/api/destination', {
      method: 'POST',
      headers: {
        origin: 'https://uclv-media.vercel.app',
        'content-type': 'application/json',
        'x-uclv-request': '1',
      },
      body: JSON.stringify({ destination: join(temporaryRoot, 'downloads') }),
    })
    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('https://uclv-media.vercel.app')
  })

  it('rechaza traversal en la frontera HTTP antes de consultar el origen', async () => {
    const response = await request('/api/list?path=%2F..%2Foutside')
    expect(response.status).toBe(400)
    expect(response.json()).toMatchObject({ error: expect.stringContaining('no permitido') })
  })
})
