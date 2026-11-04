// @vitest-environment node
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { DownloadManager } from './download-manager.mjs'

const resources = []

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.server?.close()
    await rm(resource.directory, { recursive: true, force: true })
  }
})

async function setup(tail) {
  const directory = await mkdtemp(join(tmpdir(), 'descargar-uclv-'))
  const payload = Buffer.from(`verified-head-${tail}`)
  const stateFile = join(directory, 'state', 'downloads.json')
  const destination = join(directory, 'Downloads')
  const seen = []
  let flakyAttempts = 0
  const server = createServer((request, response) => {
    seen.push({ range: request.headers.range, ifRange: request.headers['if-range'] })
    if (request.url === '/missing.mp4') { response.writeHead(404); response.end(); return }
    if (request.url === '/flaky.mp4' && flakyAttempts++ === 0) { response.writeHead(503); response.end(); return }
    const offset = request.headers.range ? Number(/^bytes=(\d+)-/.exec(request.headers.range)?.[1]) : 0
    if (request.url === '/changed.mp4' && offset > 0) {
      response.writeHead(200, { etag: '"fixture-v2"', 'accept-ranges': 'bytes', 'content-length': payload.length })
      response.end(payload)
      return
    }
    if (request.url === '/range-invalid.mp4') {
      response.writeHead(416, { 'content-range': `bytes */${payload.length}`, etag: '"fixture-v1"' })
      response.end()
      return
    }
    response.setHeader('etag', '"fixture-v1"')
    response.setHeader('accept-ranges', 'bytes')
    if (offset) {
      response.writeHead(206, { 'content-range': `bytes ${offset}-${payload.length - 1}/${payload.length}`, 'content-length': payload.length - offset })
    } else response.writeHead(200, { 'content-length': payload.length })
    response.end(payload.subarray(offset))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  resources.push({ directory, server })
  return { directory, destination, stateFile, origin, payload, seen }
}

async function waitFor(test) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (await test()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`La operación no terminó dentro del tiempo de prueba: ${JSON.stringify(await test.snapshot?.())}`)
}

describe('durable download manager', () => {
  it('retoma un parcial persistido con Range/If-Range y valida antes de promoverlo', async () => {
    const fixture = await setup('tail')
    const prefix = fixture.payload.subarray(0, 14)
    const sourcePath = '/series/episode 01.mp4'
    const targetPath = join(fixture.destination, 'series', 'episode 01.mp4')
    await mkdir(join(fixture.destination, 'series'), { recursive: true })
    await writeFile(`${targetPath}.part`, prefix)
    await mkdir(join(fixture.directory, 'state'), { recursive: true })
    await writeFile(fixture.stateFile, JSON.stringify({ version: 1, jobs: [{
      id: 'job-resume', status: 'downloading', createdAt: 1, updatedAt: 1,
      items: [{ id: sourcePath, name: 'episode 01.mp4', path: sourcePath, sizeBytes: fixture.payload.length, status: 'downloading', bytesDone: prefix.length, etag: '"fixture-v1"', attempts: 0 }],
    }] }))
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    const complete = () => manager.snapshot()[0]?.status === 'completed'
    complete.snapshot = () => manager.snapshot()
    await waitFor(complete)
    const final = await readFile(targetPath)
    expect(createHash('sha256').update(final).digest('hex')).toBe(createHash('sha256').update(fixture.payload).digest('hex'))
    expect(fixture.seen[0]).toEqual({ range: `bytes=${prefix.length}-`, ifRange: '"fixture-v1"' })
    expect(manager.snapshot()[0].items[0].status).toBe('completed')
  })

  it('rechaza traversal en las rutas entregadas a la cola', async () => {
    const fixture = await setup('x')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await expect(manager.enqueue([{ id: 'bad', name: 'x', path: '/../outside' }])).rejects.toThrow(/ruta/)
  })

  it('no sobrescribe un archivo ya existente', async () => {
    const fixture = await setup('tail')
    const target = join(fixture.destination, 'series', 'episode.mp4')
    await mkdir(join(fixture.destination, 'series'), { recursive: true })
    await writeFile(target, 'keep')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await manager.enqueue([{ id: '/series/episode.mp4', name: 'episode.mp4', path: '/series/episode.mp4', sizeBytes: fixture.payload.length }])
    await waitFor(() => manager.snapshot()[0]?.status === 'error')
    expect(await readFile(target, 'utf8')).toBe('keep')
    expect(manager.snapshot()[0].items[0].error).toMatch(/no se sobrescribió/)
  })

  it('finaliza con rename atómico cuando el volumen no admite hard links', async () => {
    const fixture = await setup('atomic-rename')
    const manager = new DownloadManager({
      ...fixture,
      sourceOrigin: fixture.origin,
      linkImpl: async () => { throw Object.assign(new Error('hard links are unavailable'), { code: 'EPERM' }) },
    })
    await manager.init()
    const job = await manager.enqueue([{ id: '/episode.mp4', name: 'episode.mp4', path: '/episode.mp4', sizeBytes: fixture.payload.length }])
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    const target = join(fixture.destination, 'episode.mp4')
    expect(await readFile(target)).toEqual(fixture.payload)
    await expect(readFile(`${target}.part`)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(manager.snapshot().find((candidate) => candidate.id === job.id)?.items[0].status).toBe('completed')
  })

  it('promueve un parcial ya completo tras reiniciar sin solicitar un rango vacío', async () => {
    const fixture = await setup('complete-partial-recovery')
    const target = join(fixture.destination, 'episode.mp4')
    await mkdir(fixture.destination, { recursive: true })
    await writeFile(`${target}.part`, fixture.payload)
    await mkdir(join(fixture.directory, 'state'), { recursive: true })
    await writeFile(fixture.stateFile, JSON.stringify({ version: 1, jobs: [{
      id: 'job-complete-partial', status: 'error', destination: fixture.destination, createdAt: 1, updatedAt: 1,
      items: [{ id: '/episode.mp4', name: 'episode.mp4', path: '/episode.mp4', sizeBytes: fixture.payload.length, status: 'error', bytesDone: fixture.payload.length, etag: '"fixture-v1"', error: 'error anterior' }],
    }] }))
    const manager = new DownloadManager({
      ...fixture,
      sourceOrigin: fixture.origin,
      linkImpl: async () => { throw Object.assign(new Error('hard links are unavailable'), { code: 'EPERM' }) },
    })
    await manager.init()
    await manager.resume('job-complete-partial')
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(fixture.seen).toHaveLength(0)
    expect(await readFile(target)).toEqual(fixture.payload)
    await expect(readFile(`${target}.part`)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(manager.snapshot()[0].items[0].error).toBeUndefined()
  })

  it('el fallback de rename también conserva un destino existente', async () => {
    const fixture = await setup('existing-rename')
    const target = join(fixture.destination, 'episode.mp4')
    const manager = new DownloadManager({
      ...fixture,
      sourceOrigin: fixture.origin,
      linkImpl: async (_partial, destination) => {
        await writeFile(destination, 'keep')
        throw Object.assign(new Error('hard links are unavailable'), { code: 'EPERM' })
      },
    })
    await manager.init()
    const job = await manager.enqueue([{ id: '/episode.mp4', name: 'episode.mp4', path: '/episode.mp4', sizeBytes: fixture.payload.length }])
    await waitFor(() => manager.snapshot().find((candidate) => candidate.id === job.id)?.status === 'error')
    expect(await readFile(target, 'utf8')).toBe('keep')
    expect(await readFile(`${target}.part`)).toEqual(fixture.payload)
  })

  it('persiste el destino elegido y lo recupera al volver a iniciar', async () => {
    const fixture = await setup('tail')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    const chosen = join(fixture.directory, 'otro destino')
    await manager.setDestination(chosen)
    const restarted = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await restarted.init()
    expect(restarted.destination).toBe(chosen)
  })

  it('no reintenta respuestas permanentes 404', async () => {
    const fixture = await setup('tail')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await manager.enqueue([{ id: '/missing.mp4', name: 'missing.mp4', path: '/missing.mp4', sizeBytes: 10 }])
    await waitFor(() => manager.snapshot()[0]?.status === 'error')
    expect(fixture.seen).toHaveLength(1)
    expect(manager.snapshot()[0].items[0].error).toBe('El origen respondió HTTP 404.')
  })

  it('reintenta una vez un 503 y después completa con el fixture', async () => {
    const fixture = await setup('retry')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await manager.enqueue([{ id: '/flaky.mp4', name: 'flaky.mp4', path: '/flaky.mp4', sizeBytes: fixture.payload.length }])
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(fixture.seen).toHaveLength(2)
    expect(manager.snapshot()[0].items[0].attempts).toBe(2)
  })

  it('reconcilia el tamaño redondeado del índice con Content-Length real', async () => {
    const fixture = await setup('rounded-size')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await manager.enqueue([{ id: '/series/rounded.mp4', name: 'rounded.mp4', path: '/series/rounded.mp4', sizeBytes: fixture.payload.length - 1 }])
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(manager.snapshot()[0].items[0].sizeBytes).toBe(fixture.payload.length)
    expect(await readFile(join(fixture.destination, 'series', 'rounded.mp4'))).toEqual(fixture.payload)
  })

  it('continúa con el resto de la lista si un archivo devuelve 404', async () => {
    const fixture = await setup('later')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await manager.enqueue([
      { id: '/missing.mp4', name: 'missing.mp4', path: '/missing.mp4', sizeBytes: 10 },
      { id: '/available.mp4', name: 'available.mp4', path: '/available.mp4', sizeBytes: fixture.payload.length },
    ])
    await waitFor(() => manager.snapshot()[0]?.status === 'error' && manager.snapshot()[0]?.items[1]?.status === 'completed')
    expect(manager.snapshot()[0].items[0].status).toBe('error')
    expect(manager.snapshot()[0].items[1].status).toBe('completed')
  })

  it('omite rutas duplicadas dentro de la cola y entre trabajos', async () => {
    const fixture = await setup('deduplicated')
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    const item = { id: '/series/a.mp4', name: 'a.mp4', path: '/series/a.mp4', sizeBytes: fixture.payload.length }
    const job = await manager.enqueue([item, item])
    expect(job.items).toHaveLength(1)
    expect(job.duplicateCount).toBe(1)
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    await expect(manager.enqueue([item])).rejects.toThrow(/ya están en la cola/)
  })

  it('reconcilia un final que se guardó antes del checkpoint del job', async () => {
    const fixture = await setup('already-final')
    const sourcePath = '/series/complete.mp4'
    const target = join(fixture.destination, 'series', 'complete.mp4')
    await mkdir(join(fixture.destination, 'series'), { recursive: true })
    await writeFile(target, fixture.payload)
    await mkdir(join(fixture.directory, 'state'), { recursive: true })
    await writeFile(fixture.stateFile, JSON.stringify({ version: 1, jobs: [{
      id: 'job-crash-window', status: 'downloading', createdAt: 1, updatedAt: 1,
      items: [{ id: sourcePath, name: 'complete.mp4', path: sourcePath, sizeBytes: fixture.payload.length, status: 'downloading', bytesDone: 0 }],
    }] }))
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(fixture.seen).toHaveLength(0)
  })

  it('reinicia desde cero si If-Range descubre que el recurso cambió', async () => {
    const fixture = await setup('changed')
    const sourcePath = '/changed.mp4'
    const target = join(fixture.destination, 'changed.mp4')
    const prefix = fixture.payload.subarray(0, 5)
    await mkdir(fixture.destination, { recursive: true })
    await writeFile(`${target}.part`, prefix)
    await mkdir(join(fixture.directory, 'state'), { recursive: true })
    await writeFile(fixture.stateFile, JSON.stringify({ version: 1, jobs: [{
      id: 'job-changed', status: 'downloading', destination: fixture.destination, createdAt: 1, updatedAt: 1,
      items: [{ id: sourcePath, name: 'changed.mp4', path: sourcePath, sizeBytes: fixture.payload.length, status: 'downloading', bytesDone: prefix.length, etag: '"fixture-v1"' }],
    }] }))
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(fixture.seen[0]).toEqual({ range: `bytes=${prefix.length}-`, ifRange: '"fixture-v1"' })
    expect(createHash('sha256').update(await readFile(target)).digest('hex'))
      .toBe(createHash('sha256').update(fixture.payload).digest('hex'))
  })

  it('conserva el parcial y no reintenta un 416 fuera del rango válido', async () => {
    const fixture = await setup('range-invalid')
    const sourcePath = '/range-invalid.mp4'
    const target = join(fixture.destination, 'range-invalid.mp4')
    const partial = Buffer.from('partial')
    await mkdir(fixture.destination, { recursive: true })
    await writeFile(`${target}.part`, partial)
    await mkdir(join(fixture.directory, 'state'), { recursive: true })
    await writeFile(fixture.stateFile, JSON.stringify({ version: 1, jobs: [{
      id: 'job-416', status: 'downloading', destination: fixture.destination, createdAt: 1, updatedAt: 1,
      items: [{ id: sourcePath, name: 'range-invalid.mp4', path: sourcePath, sizeBytes: 100, status: 'downloading', bytesDone: partial.length, etag: '"fixture-v1"' }],
    }] }))
    const manager = new DownloadManager({ ...fixture, sourceOrigin: fixture.origin })
    await manager.init()
    await waitFor(() => manager.snapshot()[0]?.status === 'error')
    expect(fixture.seen).toHaveLength(1)
    expect(await readFile(`${target}.part`)).toEqual(partial)
  })

  it('pausa el stream, conserva el parcial y continúa desde el offset en la misma cola', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'descargar-uclv-pause-'))
    const destination = join(directory, 'Downloads')
    const stateFile = join(directory, 'state', 'downloads.json')
    const payload = Buffer.alloc(512 * 1024, 65)
    const seen = []
    const server = createServer((request, response) => {
      const range = request.headers.range
      const offset = range ? Number(/^bytes=(\d+)-/.exec(range)?.[1]) : 0
      seen.push({ range, ifRange: request.headers['if-range'] })
      response.setHeader('etag', '"slow-v1"')
      response.setHeader('accept-ranges', 'bytes')
      if (offset) response.writeHead(206, { 'content-range': `bytes ${offset}-${payload.length - 1}/${payload.length}`, 'content-length': payload.length - offset })
      else response.writeHead(200, { 'content-length': payload.length })
      let cursor = offset
      const timer = setInterval(() => {
        const end = Math.min(cursor + 8192, payload.length)
        response.write(payload.subarray(cursor, end))
        cursor = end
        if (cursor >= payload.length) { clearInterval(timer); response.end() }
      }, 25)
      response.on('close', () => clearInterval(timer))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    resources.push({ directory, server })
    const manager = new DownloadManager({ stateFile, destination, sourceOrigin: origin })
    await manager.init()
    const job = await manager.enqueue([{ id: '/slow.mp4', name: 'slow.mp4', path: '/slow.mp4', sizeBytes: payload.length }])
    const partial = join(destination, 'slow.mp4.part')
    await waitFor(async () => {
      try { return (await readFile(partial)).length > 0 } catch { return false }
    })
    await manager.pause(job.id)
    await waitFor(() => manager.snapshot()[0]?.status === 'paused')
    const partialBytes = (await readFile(partial)).length
    expect(partialBytes).toBeGreaterThan(0)
    expect(partialBytes).toBeLessThan(payload.length)
    await manager.resume(job.id)
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(seen[1]).toEqual({ range: `bytes=${partialBytes}-`, ifRange: '"slow-v1"' })
    expect(createHash('sha256').update(await readFile(join(destination, 'slow.mp4'))).digest('hex'))
      .toBe(createHash('sha256').update(payload).digest('hex'))
  })

  it('recupera un corte de conexión y continúa desde los bytes parciales', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'descargar-uclv-cut-'))
    const destination = join(directory, 'Downloads')
    const payload = Buffer.alloc(256 * 1024, 65)
    const seen = []
    let interrupted = false
    const server = createServer((request, response) => {
      const range = request.headers.range
      const offset = range ? Number(/^bytes=(\d+)-/.exec(range)?.[1]) : 0
      seen.push({ range, ifRange: request.headers['if-range'] })
      response.setHeader('etag', '"cut-v1"')
      response.setHeader('accept-ranges', 'bytes')
      if (offset) {
        response.writeHead(206, { 'content-range': `bytes ${offset}-${payload.length - 1}/${payload.length}`, 'content-length': payload.length - offset })
        response.end(payload.subarray(offset))
        return
      }
      response.writeHead(200, { 'content-length': payload.length })
      let cursor = 0
      const timer = setInterval(() => {
        const end = Math.min(cursor + 8192, payload.length)
        response.write(payload.subarray(cursor, end))
        cursor = end
        if (!interrupted && cursor >= 32 * 1024) {
          interrupted = true
          clearInterval(timer)
          response.destroy()
        } else if (cursor >= payload.length) {
          clearInterval(timer)
          response.end()
        }
      }, 5)
      response.on('close', () => clearInterval(timer))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    resources.push({ directory, server })
    const manager = new DownloadManager({ stateFile: join(directory, 'state', 'downloads.json'), destination, sourceOrigin: origin })
    await manager.init()
    const job = await manager.enqueue([{ id: '/cut.mp4', name: 'cut.mp4', path: '/cut.mp4', sizeBytes: payload.length }])
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(seen).toHaveLength(2)
    expect(seen[0].range).toBeUndefined()
    expect(seen[1].range).toMatch(/^bytes=\d+-$/)
    expect(Number(/^bytes=(\d+)-$/.exec(seen[1].range)?.[1])).toBeGreaterThan(0)
    expect(seen[1].ifRange).toBe('"cut-v1"')
    expect(manager.snapshot().find((candidate) => candidate.id === job.id)?.items[0].attempts).toBe(2)
    expect(createHash('sha256').update(await readFile(join(destination, 'cut.mp4'))).digest('hex'))
      .toBe(createHash('sha256').update(payload).digest('hex'))
  })

  it('conserva el parcial al fallar con ENOSPC y permite reanudar después de liberar espacio', async () => {
    const fixture = await setup('disk-full')
    let failOnce = true
    const manager = new DownloadManager({
      ...fixture,
      sourceOrigin: fixture.origin,
      createWriteStreamImpl: (path, options) => {
        if (!failOnce) return createWriteStream(path, options)
        failOnce = false
        const filePromise = open(path, options.flags)
        let wrotePrefix = false
        return new Writable({
          write(chunk, _encoding, callback) {
            if (wrotePrefix) {
              callback(Object.assign(new Error('No space left on device'), { code: 'ENOSPC' }))
              return
            }
            wrotePrefix = true
            filePromise
              .then((file) => file.write(chunk.subarray(0, Math.min(5, chunk.length))))
              .then(() => callback(Object.assign(new Error('No space left on device'), { code: 'ENOSPC' })), callback)
          },
          destroy(error, callback) {
            filePromise.then((file) => file.close()).then(() => callback(error), () => callback(error))
          },
        })
      },
    })
    await manager.init()
    const job = await manager.enqueue([{ id: '/full.mp4', name: 'full.mp4', path: '/full.mp4', sizeBytes: fixture.payload.length }])
    await waitFor(() => manager.snapshot()[0]?.status === 'error')
    const target = join(fixture.destination, 'full.mp4')
    const partial = await readFile(`${target}.part`)
    expect(partial.length).toBeGreaterThan(0)
    expect(partial.length).toBeLessThan(fixture.payload.length)
    expect(manager.snapshot()[0].items[0].bytesDone).toBe(partial.length)
    expect(manager.snapshot()[0].items[0].error).toMatch(/No space left on device/)
    expect(fixture.seen).toHaveLength(1)

    await manager.resume(job.id)
    await waitFor(() => manager.snapshot()[0]?.status === 'completed')
    expect(fixture.seen[1]).toEqual({ range: `bytes=${partial.length}-`, ifRange: '"fixture-v1"' })
    expect(createHash('sha256').update(await readFile(target)).digest('hex'))
      .toBe(createHash('sha256').update(fixture.payload).digest('hex'))
  })
})
