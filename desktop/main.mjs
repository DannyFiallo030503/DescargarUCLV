import { app, BrowserWindow, dialog, shell, utilityProcess } from 'electron'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(desktopDirectory, '..')
const resourcesDirectory = app.isPackaged ? process.resourcesPath : projectDirectory
const gatewayPath = join(resourcesDirectory, 'server', 'gateway.mjs')
let gatewayProcess
let mainWindow
let quitRequested = false

const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) app.quit()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close((error) => error ? reject(error) : resolvePort(port))
    })
  })
}

async function startLocalGateway() {
  const port = await findAvailablePort()
  if (!port) throw new Error('No se pudo reservar un puerto local para el catálogo.')

  gatewayProcess = utilityProcess.fork(gatewayPath, [], {
    cwd: resourcesDirectory,
    env: {
      ...process.env,
      UCLV_PORT: String(port),
      UCLV_APP_ORIGIN: `http://127.0.0.1:${port}`,
      UCLV_STATE_HOME: join(app.getPath('userData'), 'state'),
    },
    serviceName: 'Descargar UCLV · conexión local',
    stdio: 'pipe',
  })

  let gatewayLog = ''
  gatewayProcess.stdout?.on('data', (chunk) => { gatewayLog = `${gatewayLog}${chunk}`.slice(-4000) })
  gatewayProcess.stderr?.on('data', (chunk) => { gatewayLog = `${gatewayLog}${chunk}`.slice(-4000) })
  const childExited = new Promise((_, reject) => {
    gatewayProcess.once('exit', (code) => reject(new Error(`El servicio local se cerró (${code ?? 'sin código'}). ${gatewayLog}`)))
  })
  const baseUrl = `http://127.0.0.1:${port}`
  const healthCheck = (async () => {
    const deadline = Date.now() + 20_000
    let lastError
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(800) })
        const result = await response.json()
        if (response.ok && result.ok === true && result.source === 'https://visuales.uclv.cu') return baseUrl
        lastError = new Error('El servicio local respondió de forma inesperada.')
      } catch (error) {
        lastError = error
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
    }
    throw new Error(`El servicio local no respondió a tiempo. ${gatewayLog || lastError?.message || ''}`)
  })()
  return Promise.race([healthCheck, childExited])
}

function createMainWindow(baseUrl) {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 900,
    minHeight: 680,
    show: false,
    backgroundColor: '#f6f5f1',
    title: 'Descargar UCLV',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.removeMenu()
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const destination = new URL(url)
      if (destination.protocol === 'https:' && destination.hostname === 'visuales.uclv.cu') {
        void shell.openExternal(destination.href)
      }
    } catch { /* Ignore invalid or unsupported external links. */ }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== `${baseUrl}/` && !url.startsWith(`${baseUrl}/`)) event.preventDefault()
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`No se pudo cargar la interfaz (${code}): ${description} — ${url}`)
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = undefined })
  void mainWindow.loadURL(`${baseUrl}/`)
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) return
  try {
    const baseUrl = await startLocalGateway()
    createMainWindow(baseUrl)
  } catch (error) {
    console.error(error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'No se pudo iniciar Descargar UCLV',
      message: error instanceof Error ? error.message : 'No se pudo iniciar la conexión local.',
      buttons: ['Cerrar'],
    })
    app.quit()
  }
})

app.on('before-quit', () => {
  if (quitRequested) return
  quitRequested = true
  gatewayProcess?.kill()
})

app.on('window-all-closed', () => app.quit())
