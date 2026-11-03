import { createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm, stat, statfs, link, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 250

class TransferError extends Error {
  constructor(message, permanent = false) {
    super(message)
    this.permanent = permanent
  }
}

function sanitizeSegment(value) {
  const clean = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim()
  if (!clean || clean === '.' || clean === '..') throw new Error('El nombre del archivo contiene una ruta no permitida.')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) return `_${clean}`.slice(0, 180)
  return clean.slice(0, 180)
}

async function ensureSafeDirectories(root, segments) {
  let current = root
  for (const segment of segments) {
    current = resolve(current, segment)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('La ruta de destino contiene un enlace o un elemento que no es carpeta.')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      await mkdir(current)
    }
  }
}

async function hasSafeExistingParents(root, segments) {
  let current = root
  for (const segment of segments) {
    current = resolve(current, segment)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || !info.isDirectory()) return false
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      throw error
    }
  }
  return true
}

function parseContentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(value || '')
  if (!match) return undefined
  return { start: Number(match[1]), end: Number(match[2]), total: match[3] === '*' ? undefined : Number(match[3]) }
}

export class DownloadManager {
  constructor({ stateFile, destination, fetchImpl = fetch, linkImpl = link, renameImpl = rename, onChange = () => {}, sourceOrigin = 'https://visuales.uclv.cu' }) {
    if (!isAbsolute(destination) || !isAbsolute(stateFile)) throw new Error('La carpeta de descargas y el estado deben usar rutas absolutas.')
    this.stateFile = stateFile
    this.destination = resolve(destination)
    this.fetchImpl = fetchImpl
    this.linkImpl = linkImpl
    this.renameImpl = renameImpl
    this.sourceOrigin = sourceOrigin
    this.onChange = onChange
    this.jobs = []
    this.activeController = undefined
    this.activeJobId = undefined
    this.pumpPromise = undefined
    this.stopping = false
    this.writeChain = Promise.resolve()
  }

  async init() {
    await mkdir(this.destination, { recursive: true })
    await mkdir(dirname(this.stateFile), { recursive: true })
    try {
      const data = JSON.parse(await readFile(this.stateFile, 'utf8'))
      if (typeof data.destination === 'string' && isAbsolute(data.destination)) this.destination = resolve(data.destination)
      await mkdir(this.destination, { recursive: true })
      this.jobs = Array.isArray(data.jobs) ? data.jobs : []
      for (const job of this.jobs) {
        if (!job.destination) job.destination = this.destination
        if (job.status === 'downloading') job.status = 'queued'
        for (const item of job.items ?? []) {
          if (item.status === 'completed') delete item.error
          if (item.status !== 'downloading') continue
          item.status = 'queued'
          const root = job.destination || this.destination
          const relativeSource = item.path.split('/').filter(Boolean).map(sanitizeSegment)
          const target = resolve(root, ...relativeSource)
          try {
            const finalInfo = await lstat(target)
            if (finalInfo.isFile() && !finalInfo.isSymbolicLink() && (item.sizeBytes === undefined || finalInfo.size === item.sizeBytes)) {
              item.status = 'completed'
              item.bytesDone = finalInfo.size
              continue
            }
          } catch (error) { if (error?.code !== 'ENOENT') throw error }
          try {
            const partialInfo = await lstat(`${target}.part`)
            if (partialInfo.isFile() && !partialInfo.isSymbolicLink()) item.bytesDone = partialInfo.size
            else item.bytesDone = 0
          } catch (error) { if (error?.code === 'ENOENT') item.bytesDone = 0; else throw error }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await this.persist()
    this.schedule()
  }

  snapshot() {
    return this.jobs.map((job) => structuredClone(job))
  }

  async setDestination(value) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('Escribe una ruta absoluta de carpeta.')
    const nextDestination = resolve(value)
    await mkdir(nextDestination, { recursive: true })
    const probe = resolve(nextDestination, `.descargar-uclv-check-${randomUUID()}`)
    await writeFile(probe, '', { flag: 'wx' })
    await rm(probe, { force: true })
    this.destination = nextDestination
    await this.persist()
    return this.destination
  }

  async enqueue(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 2000) throw new Error('Selecciona entre 1 y 2000 archivos.')
    const normalized = items.map((item) => {
      if (!item || typeof item.path !== 'string' || !item.path.startsWith('/') || item.path.startsWith('//') || item.path.includes('\\')) throw new Error('Una ruta de origen no es válida.')
      const parts = item.path.split('/').filter(Boolean).map(sanitizeSegment)
      if (!parts.length || parts.some((part) => part === '..')) throw new Error('Una ruta de origen no es válida.')
      const name = sanitizeSegment(String(item.name || parts.at(-1)))
      if (name !== parts.at(-1)) parts[parts.length - 1] = name
      const sizeBytes = item.sizeBytes == null ? undefined : Number(item.sizeBytes)
      if (sizeBytes !== undefined && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)) throw new Error('Un tamaño de archivo no es válido.')
      return { id: String(item.id || item.path), name, path: `/${parts.join('/')}`, sizeBytes, status: 'queued', bytesDone: 0, attempts: 0 }
    })
    const uniqueByPath = new Map(normalized.map((item) => [item.path, item]))
    const uniqueItems = [...uniqueByPath.values()]
    const inExistingJobs = new Set(this.jobs.filter((candidate) => candidate.destination === this.destination)
      .flatMap((candidate) => candidate.items).map((item) => item.path))
    const freshItems = uniqueItems.filter((item) => !inExistingJobs.has(item.path))
    const duplicateCount = normalized.length - freshItems.length
    if (!freshItems.length) throw new Error('Todos esos archivos ya están en la cola. No se añadieron duplicados.')
    const job = { id: randomUUID(), destination: this.destination, duplicateCount, createdAt: Date.now(), updatedAt: Date.now(), status: 'queued', items: freshItems }
    const usage = await statfs(job.destination)
    const freeBytes = Number(usage.bavail) * Number(usage.bsize)
    const reservedBytes = this.jobs.filter((candidate) => candidate.destination === job.destination && !['completed', 'cancelled'].includes(candidate.status))
      .flatMap((candidate) => candidate.items)
      .filter((item) => item.status !== 'completed')
      .reduce((sum, item) => sum + Math.max(0, (item.sizeBytes ?? 0) - (item.bytesDone ?? 0)), 0)
    const plannedBytes = freshItems.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
    if (plannedBytes + reservedBytes > freeBytes) throw new Error(`Espacio insuficiente en ${this.destination}: se requieren ${plannedBytes + reservedBytes} bytes y hay ${freeBytes} bytes disponibles.`)
    this.jobs.unshift(job)
    await this.persist()
    this.schedule()
    return structuredClone(job)
  }

  async pause(jobId) {
    const job = this.jobs.find((candidate) => candidate.id === jobId)
    if (!job || !['queued', 'downloading'].includes(job.status)) return false
    job.status = 'paused'
    job.updatedAt = Date.now()
    if (this.activeJobId === jobId) this.activeController?.abort(new Error('Pausada por la persona usuaria.'))
    await this.persist()
    return true
  }

  async resume(jobId) {
    const job = this.jobs.find((candidate) => candidate.id === jobId)
    if (!job || !['paused', 'error'].includes(job.status)) return false
    for (const item of job.items) {
      if (item.status !== 'error') continue
      item.status = 'queued'
      delete item.error
    }
    job.status = 'queued'
    job.updatedAt = Date.now()
    await this.persist()
    this.schedule()
    return true
  }

  async remove(jobId) {
    const job = this.jobs.find((candidate) => candidate.id === jobId)
    if (!job || job.status === 'downloading') return false
    for (const item of job.items) {
      const root = job.destination || this.destination
      const parts = item.path.split('/').filter(Boolean).map(sanitizeSegment)
      const target = resolve(root, ...parts)
      const fromRoot = relative(root, target)
      if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) continue
      if (!await hasSafeExistingParents(root, parts.slice(0, -1))) continue
      await rm(`${target}.part`, { force: true })
    }
    this.jobs = this.jobs.filter((candidate) => candidate.id !== jobId)
    await this.persist()
    return true
  }

  schedule() {
    if (this.stopping) return
    if (this.pumpPromise) return
    this.pumpPromise = Promise.resolve().then(() => this.pump()).finally(() => { this.pumpPromise = undefined })
  }

  async fetchSource(path, headers, signal) {
    let url = new URL(path.split('/').map(encodeURIComponent).join('/'), `${this.sourceOrigin}/`)
    const allowedOrigin = new URL(this.sourceOrigin).origin
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const response = await this.fetchImpl(url, { headers, signal, redirect: 'manual' })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      const location = response.headers.get('location')
      if (!location || redirect === 3) throw new TransferError('El origen redirigió demasiadas veces.', true)
      const nextUrl = new URL(location, url)
      if (nextUrl.origin !== allowedOrigin) throw new TransferError('El origen redirigió fuera del host permitido.', true)
      url = nextUrl
    }
    throw new TransferError('El origen redirigió demasiadas veces.', true)
  }

  async pump() {
    while (true) {
      if (this.stopping) return
      const job = this.jobs.find((candidate) => candidate.status === 'queued')
      if (!job) return
      const item = job.items.find((candidate) => candidate.status === 'queued')
      if (!item) {
        job.status = job.items.every((candidate) => candidate.status === 'completed') ? 'completed' : 'error'
        job.updatedAt = Date.now()
        await this.persist()
        continue
      }
      job.status = 'downloading'
      item.status = 'downloading'
      this.activeJobId = job.id
      this.activeController = new AbortController()
      await this.persist()
      try {
        await this.downloadOne(item, job.destination || this.destination, this.activeController.signal, async () => {
          if (job.status !== 'paused') job.status = 'downloading'
          if (item.status !== 'queued') item.status = 'downloading'
          job.updatedAt = Date.now()
          await this.persist()
        })
        item.status = 'completed'
        item.bytesDone = item.sizeBytes ?? item.bytesDone
        delete item.error
      } catch (error) {
        const paused = job.status === 'paused'
        item.status = paused || this.stopping ? 'queued' : 'error'
        item.error = paused || this.stopping ? undefined : error instanceof Error ? error.message : 'Error de descarga.'
        if (this.stopping) job.status = 'queued'
        else if (!paused) job.status = job.items.some((candidate) => candidate.status === 'queued') ? 'queued' : 'error'
      }
      if (job.status !== 'paused' && !this.stopping) {
        job.status = job.items.every((candidate) => candidate.status === 'completed')
          ? 'completed'
          : job.items.some((candidate) => candidate.status === 'queued') ? 'queued' : 'error'
      }
      job.updatedAt = Date.now()
      this.activeController = undefined
      this.activeJobId = undefined
      await this.persist()
    }
  }

  async shutdown() {
    this.stopping = true
    this.activeController?.abort(new Error('El servicio se está cerrando.'))
    await this.pumpPromise
    await this.persist()
  }

  async downloadOne(item, destination, signal, commit) {
    const relativeSource = item.path.split('/').filter(Boolean).map(sanitizeSegment)
    const target = resolve(destination, ...relativeSource)
    const fromRoot = relative(destination, target)
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new TransferError('La ruta de destino salió de Descargas.', true)
    const partial = `${target}.part`
    await ensureSafeDirectories(destination, relativeSource.slice(0, -1))
    try { await lstat(target); throw new TransferError('Ya existe un archivo en la carpeta destino; no se sobrescribió.', true) }
    catch (error) { if (error?.code !== 'ENOENT') throw error }
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      if (signal.aborted) throw signal.reason || new Error('Descarga pausada.')
      let existing = 0
      try {
        const partInfo = await lstat(partial)
        if (partInfo.isSymbolicLink() || !partInfo.isFile()) throw new TransferError('El archivo temporal de destino no es seguro.', true)
        existing = partInfo.size
      } catch (error) { if (error?.code !== 'ENOENT') throw error }
      if (item.sizeBytes !== undefined && existing === item.sizeBytes) {
        const durableFile = await open(partial, 'r+')
        try { await durableFile.sync() } finally { await durableFile.close() }
        await this.promotePartial(partial, target)
        item.bytesDone = existing
        return
      }
      const validator = item.etag || item.lastModified
      if (existing > 0 && !validator) { await rm(partial, { force: true }); existing = 0 }
      if (item.sizeBytes !== undefined) {
        const usage = await statfs(destination)
        const freeBytes = Number(usage.bavail) * Number(usage.bsize)
        if (item.sizeBytes - existing > freeBytes) throw new TransferError(`Espacio insuficiente: quedan ${freeBytes} bytes y faltan ${Math.max(0, item.sizeBytes - existing)} bytes de este archivo.`, true)
      }
      item.attempts = attempt + 1
      const headers = { 'user-agent': 'DescargarUCLV/0.1 (personal)' }
      if (existing > 0) {
        headers.range = `bytes=${existing}-`
        headers['if-range'] = validator
      }
      const idleController = new AbortController()
      let idleTimer = setTimeout(() => idleController.abort(new Error('La conexión quedó inactiva durante 15 segundos.')), 15_000)
      const resetIdleTimer = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => idleController.abort(new Error('La conexión quedó inactiva durante 15 segundos.')), 15_000)
      }
      const combinedSignal = AbortSignal.any([signal, idleController.signal])
      try {
        const response = await this.fetchSource(item.path, headers, combinedSignal)
        const finalUrl = new URL(response.url)
        if (finalUrl.origin !== new URL(this.sourceOrigin).origin) throw new TransferError('El origen redirigió fuera del host permitido.', true)
        if (response.status === 404 || response.status === 403) {
          await response.body?.cancel()
          throw new TransferError(`El origen respondió HTTP ${response.status}.`, true)
        }
        if (response.status !== 200 && response.status !== 206) {
          await response.body?.cancel()
          throw new TransferError(`Respuesta HTTP ${response.status} al descargar.`, response.status >= 400 && response.status < 500)
        }
        const contentRange = parseContentRange(response.headers.get('content-range'))
        if (response.status === 206 && (!contentRange || contentRange.start !== existing)) throw new TransferError('El origen devolvió un rango inesperado; se conservó el parcial.', true)
        if (contentRange && (contentRange.end < contentRange.start || (contentRange.total !== undefined && contentRange.end >= contentRange.total))) throw new TransferError('El origen devolvió un Content-Range inválido.', true)
        const contentLength = response.headers.has('content-length') ? Number(response.headers.get('content-length')) : undefined
        if (contentRange && contentLength !== undefined && contentRange.end - contentRange.start + 1 !== contentLength) throw new TransferError('La longitud no coincide con Content-Range.', true)
        const append = response.status === 206 && existing > 0
        if (existing > 0 && response.status === 200) {
          existing = 0
          item.bytesDone = 0
        }
        item.etag = response.headers.get('etag') || (append ? item.etag : undefined)
        item.lastModified = response.headers.get('last-modified') || (append ? item.lastModified : undefined)
        const expected = contentRange?.total ?? (contentLength !== undefined ? contentLength + existing : item.sizeBytes)
        if (expected !== undefined && Number.isSafeInteger(expected) && expected >= 0) {
          item.sizeBytes = expected
          const usage = await statfs(destination)
          const freeBytes = Number(usage.bavail) * Number(usage.bsize)
          const remainingBytes = Math.max(0, expected - existing)
          if (remainingBytes > freeBytes) throw new TransferError(`Espacio insuficiente: quedan ${freeBytes} bytes y faltan ${remainingBytes} bytes de este archivo.`, true)
        }
        if (!response.body) throw new TransferError('El origen devolvió un archivo vacío.', true)
        await commit()
        let receivedBytes = 0
        let lastProgressCommit = Date.now()
        let progressCommit = Promise.resolve()
        await pipeline(
          Readable.fromWeb(response.body),
          new Transform({ transform(chunk, _encoding, callback) {
            resetIdleTimer()
            receivedBytes += chunk.length
            item.bytesDone = existing + receivedBytes
            if (Date.now() - lastProgressCommit >= 500) {
              lastProgressCommit = Date.now()
              progressCommit = progressCommit.then(commit)
            }
            callback(null, chunk)
          } }),
          createWriteStream(partial, { flags: append ? 'a' : 'w' }),
          { signal: combinedSignal },
        )
        await progressCommit
        const actual = (await stat(partial)).size
        item.bytesDone = actual
        if (expected !== undefined && actual !== expected) throw new TransferError(`Descarga incompleta: ${actual} de ${expected} bytes.`)
        const durableFile = await open(partial, 'r+')
        try { await durableFile.sync() } finally { await durableFile.close() }
        await this.promotePartial(partial, target)
        return
      } catch (error) {
        try {
          item.bytesDone = (await stat(partial)).size
          const durableFile = await open(partial, 'r+')
          try { await durableFile.sync() } finally { await durableFile.close() }
        } catch { item.bytesDone = 0 }
        clearTimeout(idleTimer)
        const permanentCode = ['ENOSPC', 'EACCES', 'EPERM', 'ENOTDIR', 'EISDIR', 'EEXIST', 'EINVAL'].includes(error?.code)
        if (signal.aborted || error?.permanent || permanentCode || attempt === MAX_RETRIES) throw error
        await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.floor(RETRY_DELAY_MS * (0.5 + Math.random()))))
        continue
      } finally {
        clearTimeout(idleTimer)
      }
    }
  }

  async promotePartial(partial, target) {
    try {
      await this.linkImpl(partial, target)
      await rm(partial)
    } catch (error) {
      if (error?.code === 'EEXIST') throw new TransferError('Ya existe un archivo en la carpeta destino; no se sobrescribió.', true)
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) throw error
      try {
        await lstat(target)
        throw new TransferError('Ya existe un archivo en la carpeta destino; no se sobrescribió.', true)
      } catch (targetError) {
        if (targetError?.code !== 'ENOENT') throw targetError
      }
      await this.renameImpl(partial, target)
    }
  }

  persist() {
    this.writeChain = this.writeChain.then(async () => {
      const temporary = `${this.stateFile}.tmp`
      await writeAtomic(temporary, this.stateFile, JSON.stringify({ version: 1, destination: this.destination, jobs: this.jobs }))
    })
    return this.writeChain
  }
}

async function writeAtomic(temporary, target, data) {
  await writeFile(temporary, data, { mode: 0o600 })
  const durableState = await open(temporary, 'r+')
  try { await durableState.sync() } finally { await durableState.close() }
  await rename(temporary, target)
}

export { sanitizeSegment, parseContentRange }
