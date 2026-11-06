import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Bookmark, Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp, Clock3, Copy,
  Download, ExternalLink, Eye, FileDown, FileUp, FileVideo2, Folder, FolderOpen, HardDriveDownload, Heart, Home,
  List as ListIcon, LoaderCircle, Menu, Pause, Pencil, Search,
  Settings, Sparkles, Wifi, WifiOff, X,
} from 'lucide-react'
import type { CatalogNode } from '@/domain/catalog'
import { Capacitor } from '@capacitor/core'
import { buildSelectionMarks, childNodes, descendantFiles, formatBytes, resolveSelectedFiles, summarizeSelection, toggleSelection } from '@/domain/catalog'
import { CatalogSearchClient, type CatalogSearchView } from '@/application/catalog-search-client'
import { groupRelatedSeries } from '@/domain/grouping'
import { makeBackupDocument, parseBackup, type BackupPreview } from '@/data/backup'
import { inspectBrowserStorage, requestPersistentStorage, type BrowserStorageInfo } from '@/data/browser-storage'
import { CatalogSyncService } from '@/application/catalog-sync'
import { HostedCatalogAdapter } from '@/application/hosted-catalog-adapter'
import { NativeCatalogAdapter } from '@/application/native-catalog-adapter'
import { androidDownloads, type AndroidDestinationInfo } from '@/application/android-downloads'
import { sourceUrlForPath } from '@/application/source-url'
import {
  backupRepository, catalogRepository, favoritesRepository, listsRepository,
  type SavedList, type SyncState,
} from '@/data/database'

type Screen = 'home' | 'explore' | 'favorites' | 'lists' | 'downloads' | 'settings'
type DownloadItemView = { id: string; name: string; path: string; sizeBytes?: number; sizeExact?: boolean; bytesDone: number; status: string; error?: string; retryAttempts?: number; nextAttemptAt?: number }
type DownloadJobView = { id: string; destination: string; destinationFreeBytes?: number; status: string; updatedAt: number; items: DownloadItemView[] }
type DownloadSnapshot = { destination: string; freeBytes: number; jobs: DownloadJobView[] }
type PendingDownloadPlan = { ids: string[]; clearSelection: boolean }

const navigation: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'explore', label: 'Explorar', icon: Folder },
  { id: 'favorites', label: 'Favoritos', icon: Heart },
  { id: 'lists', label: 'Mis listas', icon: ListIcon },
  { id: 'downloads', label: 'Descargas', icon: Download },
]

function EntryCheckbox({ node, mark, onToggle }: {
  node: CatalogNode; mark: 'checked' | 'partial' | 'unchecked'; onToggle: (id: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mark === 'partial' }, [mark])
  return <input
    ref={ref}
    aria-label={`${mark === 'checked' ? 'Quitar' : 'Seleccionar'} ${node.name}`}
    checked={mark === 'checked'}
    className="check-input"
    onChange={() => onToggle(node.id)}
    type="checkbox"
  />
}

function App() {
  const [nodes, setNodes] = useState<CatalogNode[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [favoriteSnapshots, setFavoriteSnapshots] = useState<Map<string, CatalogNode>>(new Map())
  const [lists, setLists] = useState<SavedList[]>([])
  const [syncState, setSyncState] = useState<SyncState>({ phase: 'idle', directoriesDone: 0, filesFound: 0 })
  const [exampleMode, setExampleMode] = useState(true)
  const [gatewayOnline, setGatewayOnline] = useState(false)
  const [catalogOnline, setCatalogOnline] = useState(false)
  const [connectionChecking, setConnectionChecking] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [vercelCatalog, setVercelCatalog] = useState(false)
  const [apiBase, setApiBase] = useState('')
  const [nativeDestination, setNativeDestination] = useState<AndroidDestinationInfo | null>(null)
  const nativePlatform = Capacitor.isNativePlatform()
  const mobileBrowserRemote = false
  const managedDownloads = nativePlatform || gatewayOnline
  const directBrowserMedia = !managedDownloads
  const [browserStorage, setBrowserStorage] = useState<BrowserStorageInfo | null>(null)
  const [currentScreen, setCurrentScreen] = useState<Screen>('home')
  const [currentPath, setCurrentPath] = useState('/')
  const [query, setQuery] = useState('')
  const [searchView, setSearchView] = useState<{ query: string; view: CatalogSearchView; pending: boolean; failed?: boolean }>({
    query: '', view: { results: [] }, pending: false,
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'append' | 'rename'>('create')
  const [dialogListId, setDialogListId] = useState('')
  const [listName, setListName] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [previewNode, setPreviewNode] = useState<CatalogNode | null>(null)
  const [downloadSnapshot, setDownloadSnapshot] = useState<DownloadSnapshot>({ destination: '', freeBytes: 0, jobs: [] })
  const [downloadMessage, setDownloadMessage] = useState('')
  const [destinationDraft, setDestinationDraft] = useState('')
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null)
  const [backupError, setBackupError] = useState('')
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [pendingDownloadPlan, setPendingDownloadPlan] = useState<PendingDownloadPlan | null>(null)
  const [busy, setBusy] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const syncService = useRef<CatalogSyncService | undefined>(undefined)
  const nativeCatalog = useRef<NativeCatalogAdapter | undefined>(undefined)
  nativeCatalog.current ??= new NativeCatalogAdapter()
  const searchWorker = useRef<CatalogSearchClient | undefined>(undefined)
  searchWorker.current ??= new CatalogSearchClient()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null)
  const apiUrl = (path: string) => `${apiBase}${path}`
  const apiFetch = (path: string, init: RequestInit = {}) => fetch(apiUrl(path), init)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!dialogOpen && !previewNode && !pendingDownloadPlan) return
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')
    if (!dialog) return
    const candidates = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0)
    const initial = dialog.querySelector<HTMLElement>('[data-initial-focus]') ?? candidates()[0] ?? dialog
    initial.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (pendingDownloadPlan) setPendingDownloadPlan(null)
        else if (previewNode) setPreviewNode(null)
        else setDialogOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = candidates()
      if (!items.length) { event.preventDefault(); dialog.focus(); return }
      const first = items[0]
      const last = items.at(-1)!
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const returnFocus = dialogReturnFocusRef.current
      dialogReturnFocusRef.current = null
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [dialogOpen, previewNode, pendingDownloadPlan])

  async function refreshLocalData(recoverInterrupted = false, resetSearchIndex = false) {
    const [catalog, savedFavorites, savedLists, savedState, isExample] = await Promise.all([
      catalogRepository.all(), favoritesRepository.all(), listsRepository.all(),
      catalogRepository.getSyncState(), catalogRepository.isExample(),
    ])
    let state = savedState
    if (resetSearchIndex) searchWorker.current?.replace(catalog)
    setNodes(catalog)
    setFavorites(new Set(savedFavorites.map((favorite) => favorite.id)))
    setFavoriteSnapshots(new Map(savedFavorites.map((favorite) => [favorite.id, favorite.snapshot])))
    setLists(savedLists)
    if (recoverInterrupted && state.phase === 'running') {
      state = { ...state, phase: 'paused' }
      await catalogRepository.saveSyncState(state)
    }
    setSyncState(state)
    setExampleMode(isExample)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      let resumeInterruptedSync = false
      try {
        await catalogRepository.ensureFixture()
        const savedSyncState = await catalogRepository.getSyncState()
        resumeInterruptedSync = (savedSyncState.phase === 'running' || savedSyncState.phase === 'partial')
          && await catalogRepository.hasAutomaticSyncWork()
        await refreshLocalData(true)
        setBrowserStorage(await inspectBrowserStorage())
        localStorage.removeItem('uclv-mobile-gateway-url')
        localStorage.removeItem('uclv-mobile-gateway-token')
        if (nativePlatform) {
          const [online] = await Promise.all([
            nativeCatalog.current!.checkConnection().catch((error: unknown) => {
              if (active) setConnectionError(error instanceof Error ? error.message : String(error))
              return false
            }),
            androidDownloads.getDestinationInfo().then((info) => {
              if (active) {
                setNativeDestination(info)
                if (info.supported && typeof info.freeBytes === 'number') {
                  setDownloadSnapshot((current) => ({
                    ...current,
                    destination: info.destination,
                    freeBytes: info.freeBytes!,
                  }))
                }
              }
            }).catch(() => undefined),
            androidDownloads.getSnapshot().then((snapshot) => {
              if (active) setDownloadSnapshot(snapshot as DownloadSnapshot)
            }).catch(() => undefined),
          ])
          if (active) setCatalogOnline(online)
        } else {
          const servedByVercel = window.location.hostname.endsWith('.vercel.app')
          const serviceHealthy = await fetch('/api/health', { cache: 'no-store' })
            .then(async (response) => {
              if (!response.ok) return false
              const health = await response.json() as { ok?: boolean; source?: string }
              return health.ok === true && health.source === 'https://visuales.uclv.cu'
            })
            .catch(() => false)
          const localDownloads = serviceHealthy
            ? await fetch('/api/downloads', { cache: 'no-store' })
              .then(async (response) => response.ok ? await response.json() as DownloadSnapshot : undefined)
              .catch(() => undefined)
            : undefined
          if (active) {
            setApiBase('')
            setGatewayOnline(serviceHealthy)
            setCatalogOnline(serviceHealthy)
            setVercelCatalog(!serviceHealthy && (servedByVercel || window.location.protocol === 'https:'))
            if (localDownloads) {
              setDownloadSnapshot(localDownloads)
              setDestinationDraft(localDownloads.destination)
            } else {
              setDownloadSnapshot((current) => ({ ...current, destination: 'Download' }))
            }
          }
        }
      } catch {
        if (active) { setGatewayOnline(false); setCatalogOnline(false) }
      } finally {
        if (active) setBusy(false)
      }
      if (active && resumeInterruptedSync) void startSync(true)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (query.trim().length < 2) {
      setSearchView({ query, view: { results: [] }, pending: false })
      return () => { active = false }
    }
    setSearchView({ query, view: { results: [] }, pending: true })
    const timer = setTimeout(() => {
      void searchWorker.current!.search(query, nodes).then((view) => {
        if (active) setSearchView({ query, view, pending: false })
      }).catch(() => {
        if (active) setSearchView({ query, view: { results: [] }, pending: false, failed: true })
      })
    }, 100)
    return () => { active = false; clearTimeout(timer) }
  }, [query, nodes])

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const currentNode = nodeById.get(currentPath) ?? nodeById.get('/')
  const currentChildren = useMemo(() => childNodes(currentNode?.id ?? '/', nodes), [currentNode, nodes])
  const folders = currentChildren.filter((node) => node.kind === 'directory')
  const files = currentChildren.filter((node) => node.kind === 'file')
  const currentSearchView = searchView.query === query ? searchView : undefined
  const searchResults = currentSearchView?.view.results ?? []
  const correction = currentSearchView?.view.correction
  const seriesGroups = useMemo(() => groupRelatedSeries(nodes), [nodes])
  const selection = useMemo(() => summarizeSelection(nodes, selectedIds), [nodes, selectedIds])
  const selectionMarks = useMemo(() => buildSelectionMarks(nodes, selectedIds), [nodes, selectedIds])
  const favoriteNodes = [...favorites].map((id) => nodeById.get(id) ?? favoriteSnapshots.get(id)).filter((node): node is CatalogNode => Boolean(node))
  const queuedPaths = new Set(mobileBrowserRemote ? [] : downloadSnapshot.jobs
    .filter((job) => job.destination === downloadSnapshot.destination)
    .flatMap((job) => job.items.map((item) => item.path)))
  const pendingNodes = pendingDownloadPlan?.ids.map((id) => nodeById.get(id)).filter((node): node is CatalogNode => node?.kind === 'file') ?? []
  const pendingDuplicates = pendingNodes.filter((node) => queuedPaths.has(node.relativePath)).length
  const newPendingNodes = pendingNodes.filter((node) => !queuedPaths.has(node.relativePath))
  const pendingSummary = summarizeSelection(nodes, new Set(pendingNodes.map((node) => node.id)))
  const missingPendingCount = pendingDownloadPlan ? pendingDownloadPlan.ids.length - pendingNodes.length : 0
  const destinationReady = mobileBrowserRemote || gatewayOnline || (nativePlatform && nativeDestination?.supported === true && typeof nativeDestination.freeBytes === 'number')

  function navigate(screen: Screen) {
    setCurrentScreen(screen)
    setMobileNavOpen(false)
    if (screen !== 'explore') { setCurrentPath('/'); setQuery('') }
  }

  function toggleNode(id: string) {
    setSelectedIds((current) => toggleSelection(id, nodes, current))
  }

  async function toggleFavorite(id: string) {
    await favoritesRepository.toggle(id, nodeById.get(id) ?? favoriteSnapshots.get(id))
    const saved = await favoritesRepository.all()
    setFavorites(new Set(saved.map((favorite) => favorite.id)))
    setFavoriteSnapshots(new Map(saved.map((favorite) => [favorite.id, favorite.snapshot])))
  }

  function openDirectory(node: CatalogNode) {
    setCurrentPath(node.relativePath)
    setCurrentScreen('explore')
  }

  function startSearch(value: string) {
    setQuery(value)
    setCurrentScreen('explore')
    if (value.trim()) setCurrentPath('/')
  }

  async function startSync(autoResume = false) {
    const savedSyncState = await catalogRepository.getSyncState()
    if (!autoResume && syncState.phase === 'running') return
    if (!autoResume) {
      // Request storage protection directly from the user's Sync click before awaiting network work.
      const storageRequest = requestPersistentStorage()
      setBrowserStorage(await storageRequest)
    }
    syncService.current = new CatalogSyncService(
      nativePlatform ? nativeCatalog.current! : new HostedCatalogAdapter(),
      (entries) => searchWorker.current?.update(entries),
    )
    const retryDeferred = !autoResume && (savedSyncState.phase === 'partial'
      || (savedSyncState.phase === 'paused' && (savedSyncState.deferredDirectories ?? 0) > 0))
    const result = await syncService.current.run((state) => {
      setSyncState(state)
      if (state.directoriesDone % 5 === 0 || state.phase !== 'running') void refreshLocalData()
      if (state.directoriesDone % 100 === 0 || state.phase !== 'running') {
        void inspectBrowserStorage().then(setBrowserStorage)
      }
    }, { retryDeferred })
    setSyncState(result)
    await refreshLocalData()
  }

  async function retryNativeConnection() {
    if (!nativePlatform || connectionChecking) return
    setConnectionChecking(true)
    setConnectionError('')
    try {
      await nativeCatalog.current!.checkConnection()
      setCatalogOnline(true)
      setConnectionError('')
    } catch (error) {
      setCatalogOnline(false)
      setConnectionError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectionChecking(false)
    }
  }

  function pauseSync() {
    syncService.current?.pause()
  }

  async function refreshDownloads() {
    try {
      if (nativePlatform && nativeDestination?.supported) {
        setDownloadSnapshot(await androidDownloads.getSnapshot() as DownloadSnapshot)
        return
      }
      const response = await apiFetch('/api/downloads', { cache: 'no-store' })
      if (response.ok) setDownloadSnapshot(await response.json() as DownloadSnapshot)
    } catch { /* keep the most recent local snapshot visible while offline */ }
  }

  async function mutateDownload(url: string, method: 'POST' | 'DELETE', body?: unknown) {
    try {
      if (nativePlatform) {
        const action = method === 'DELETE' ? 'remove' : url.endsWith('/pause') ? 'pause' : 'resume'
        setDownloadSnapshot(await androidDownloads.control({ action }) as DownloadSnapshot)
        setDownloadMessage(action === 'pause' ? 'La cola quedó pausada. Los avances parciales se conservaron.' : action === 'resume' ? 'Se reanudó la cola guardada.' : 'Se quitó la cola; los archivos terminados se conservaron en Descargas.')
        return
      }
      const response = await apiFetch(url, {
        method,
        headers: { 'content-type': 'application/json', 'x-uclv-request': '1' },
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la descarga.')
      await refreshDownloads()
    } catch (error) {
      setDownloadMessage(error instanceof Error ? error.message : 'No se pudo actualizar la descarga.')
    }
  }

  async function saveDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const response = await apiFetch('/api/destination', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-uclv-request': '1' },
        body: JSON.stringify({ destination: destinationDraft.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la carpeta.')
      setDownloadSnapshot((current) => ({ ...current, destination: result.destination, freeBytes: result.freeBytes }))
      setDestinationDraft(result.destination)
      setDownloadMessage('Se guardó la carpeta predeterminada para las próximas descargas.')
    } catch (error) {
      setDownloadMessage(error instanceof Error ? error.message : 'No se pudo guardar la carpeta.')
    }
  }

  async function exportBackup() {
    try {
      const text = makeBackupDocument(await backupRepository.export())
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `descargar-uclv-copia-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setDownloadMessage('Copia de seguridad descargada. Guárdala en un lugar seguro.')
    } catch {
      setDownloadMessage('No se pudo crear la copia. Revisa el espacio disponible e inténtalo de nuevo.')
    }
  }

  async function selectBackup(file?: File) {
    setBackupError('')
    setBackupPreview(null)
    if (!file) return
    if (file.size > 250 * 1024 * 1024) { setBackupError('El archivo supera el límite de 250 MiB.'); return }
    try { setBackupPreview(parseBackup(await file.text())) }
    catch (error) { setBackupError(error instanceof Error ? error.message : 'No se pudo leer esta copia.') }
  }

  async function restoreBackup() {
    if (!backupPreview) return
    try {
      await backupRepository.restore(backupPreview.backup)
      await refreshLocalData(false, true)
      setBackupPreview(null)
      if (backupInputRef.current) backupInputRef.current.value = ''
      setDownloadMessage('Copia restaurada. Tus listas y favoritos ya están disponibles.')
    } catch {
      setBackupError('La restauración falló; IndexedDB conserva los datos anteriores. Puedes volver a intentarlo.')
    }
  }

  useEffect(() => {
    if (downloadSnapshot.destination && !destinationDraft) setDestinationDraft(downloadSnapshot.destination)
  }, [downloadSnapshot.destination, destinationDraft])

  useEffect(() => {
    if (currentScreen !== 'downloads' || (!gatewayOnline && !(nativePlatform && nativeDestination?.supported))) return
    void refreshDownloads()
    const timer = window.setInterval(() => void refreshDownloads(), 1200)
    return () => window.clearInterval(timer)
  }, [currentScreen, gatewayOnline, nativePlatform, nativeDestination?.supported])

  function openDownloadPlan(ids: string[], clearSelection = false) {
    const items = resolveSelectedFiles(ids, nodes)
    if (!items.length) {
      setDownloadMessage('No se encontraron archivos de esta selección en el índice guardado.')
      return
    }
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPendingDownloadPlan({ ids: items.map((item) => item.id), clearSelection })
  }

  function openPreview(node: CatalogNode) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPreviewNode(node)
  }

  async function enqueueIds(ids: string[], clearSelection = false) {
    if (nativePlatform && !nativeDestination?.supported) {
      setDownloadMessage('Este Android no tiene disponible el destino seguro para estas descargas.')
      return
    }
    const selected = new Set(ids)
    const selectedFiles = resolveSelectedFiles(selected, nodes)
    const items = selectedFiles.map((node) => ({
      id: node.id, name: node.name, path: node.relativePath, sizeBytes: node.sizeBytes, sizeExact: node.sizeExact,
    }))
    if (!items.length) {
      setDownloadMessage('No se encontraron archivos de esta selección en el índice guardado.')
      return
    }
    try {
      if (!nativePlatform && !gatewayOnline) {
        for (const item of items) {
          const link = document.createElement('a')
          link.href = sourceUrlForPath(item.path)
          link.download = item.name
          link.rel = 'noreferrer'
          document.body.append(link)
          link.click()
          link.remove()
          await new Promise((resolve) => window.setTimeout(resolve, 350))
        }
        setDownloadMessage(`${items.length} archivos enviados al navegador para abrirse directamente desde UCLV. Chrome administra el avance y las descargas múltiples.`)
        if (clearSelection) setSelectedIds(new Set())
        setPendingDownloadPlan(null)
        setCurrentScreen('downloads')
        return
      }
      if (mobileBrowserRemote) {
        let started = 0
        for (const item of items) {
          const response = await apiFetch('/api/mobile-ticket', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: item.path }),
          })
          const ticket = await response.json().catch(() => ({})) as { ticket?: string; error?: string }
          if (!response.ok || !ticket.ticket) throw new Error(ticket.error || `No se pudo preparar ${item.name}.`)
          const link = document.createElement('a')
          link.href = `${apiUrl(`/api/file?path=${encodeURIComponent(item.path)}&ticket=${encodeURIComponent(ticket.ticket)}`)}&download=1&name=${encodeURIComponent(item.name)}`
          link.download = item.name
          link.rel = 'noreferrer'
          document.body.append(link)
          link.click()
          link.remove()
          started += 1
          await new Promise((resolve) => window.setTimeout(resolve, 350))
        }
        setDownloadMessage(`${started} archivos enviados a Descargas de Chrome. Si Chrome pregunta, permite las descargas múltiples. El navegador mostrará el avance.`)
        if (clearSelection) setSelectedIds(new Set())
        setPendingDownloadPlan(null)
        setCurrentScreen('downloads')
        return
      }
      if (nativePlatform) {
        const result = await androidDownloads.enqueue({ items })
        setDownloadSnapshot(result as DownloadSnapshot)
        const added = Number(result.added ?? items.length)
        setDownloadMessage(`${added} ${added === 1 ? 'archivo añadido' : 'archivos añadidos'} a la cola de Android. Puedes pausarla y reanudarla más tarde.`)
        if (clearSelection) setSelectedIds(new Set())
        setPendingDownloadPlan(null)
        setCurrentScreen('downloads')
        return
      }
      const response = await apiFetch('/api/downloads', {
        method: 'POST',
      headers: { 'content-type': 'application/json', 'x-uclv-request': '1' },
        body: JSON.stringify({ items }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo poner la selección en cola.')
      const added = result.job.items.length
      const ignored = Number(result.job.duplicateCount || 0) + Math.max(0, selected.size - items.length)
      setDownloadMessage(`${added} ${added === 1 ? 'archivo añadido' : 'archivos añadidos'} a Descargas.${ignored ? ` Se omitieron ${ignored} elementos repetidos o fuera del índice.` : ''}`)
      if (clearSelection) setSelectedIds(new Set())
      setPendingDownloadPlan(null)
      setCurrentScreen('downloads')
      await refreshDownloads()
    } catch (error) {
      setDownloadMessage(error instanceof Error ? error.message : 'No se pudo poner la selección en cola.')
    }
  }

  async function enqueueSelection() {
    openDownloadPlan([...selectedIds], true)
  }

  async function confirmDownloadPlan() {
    if (!pendingDownloadPlan) return
    if (!newPendingNodes.length && pendingDuplicates > 0 && (nativePlatform || gatewayOnline)) {
      setPendingDownloadPlan(null)
      navigate('downloads')
      return
    }
    await enqueueIds(newPendingNodes.map((node) => node.id), pendingDownloadPlan.clearSelection)
  }

  async function saveList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = listName.trim()
    const target = lists.find((item) => item.id === dialogListId)
    const itemSnapshots = Object.fromEntries([...selectedIds].flatMap((id) => {
      const node = nodeById.get(id)
      return node ? [[id, { id, name: node.name, relativePath: node.relativePath, kind: node.kind, sizeBytes: node.sizeBytes }]] : []
    }))
    if (dialogMode === 'append' && target) {
      await listsRepository.save({ ...target, itemIds: [...new Set([...target.itemIds, ...selectedIds])], itemSnapshots: { ...target.itemSnapshots, ...itemSnapshots }, updatedAt: Date.now() })
    } else {
      if (!trimmed) { setDialogError('Escribe un nombre para la lista.'); return }
      if (trimmed.length > 60) { setDialogError('El nombre no puede superar 60 caracteres.'); return }
      if (dialogMode === 'rename' && target) {
        await listsRepository.save({ ...target, name: trimmed, updatedAt: Date.now() })
      } else {
        const now = Date.now()
        await listsRepository.save({ id: crypto.randomUUID(), name: trimmed, itemIds: [...selectedIds], itemSnapshots, sortOrder: now, updatedAt: now })
      }
    }
    setLists(await listsRepository.all())
    setListName('')
    setDialogError('')
    setDialogListId('')
    setDialogOpen(false)
    setSelectedIds(new Set())
  }

  function openListDialog(mode: 'create' | 'append' | 'rename', target?: SavedList) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDialogMode(mode)
    setDialogListId(target?.id ?? '')
    setListName(mode === 'rename' ? target?.name ?? '' : mode === 'create' ? 'Mi lista' : '')
    setDialogError('')
    setDialogOpen(true)
  }

  async function removeList(list: SavedList) {
    await listsRepository.remove(list.id)
    setLists(await listsRepository.all())
  }

  async function duplicateList(list: SavedList) {
    const now = Date.now()
    await listsRepository.save({ ...list, id: crypto.randomUUID(), name: `${list.name.slice(0, 52)} (copia)`, sortOrder: now, updatedAt: now })
    setLists(await listsRepository.all())
  }

  async function moveList(list: SavedList, direction: -1 | 1) {
    const current = [...lists]
    const index = current.findIndex((item) => item.id === list.id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= current.length) return
    ;[current[index], current[next]] = [current[next], current[index]]
    const base = Date.now()
    await Promise.all(current.map((item, order) => listsRepository.save({ ...item, sortOrder: base + order })))
    setLists(await listsRepository.all())
  }

  async function removeListItem(list: SavedList, id: string) {
    const itemSnapshots = { ...list.itemSnapshots }
    delete itemSnapshots[id]
    await listsRepository.save({ ...list, itemIds: list.itemIds.filter((itemId) => itemId !== id), itemSnapshots, updatedAt: Date.now() })
    setLists(await listsRepository.all())
  }

  function crumbNodes(): CatalogNode[] {
    const crumbs: CatalogNode[] = []
    let cursor = currentNode
    while (cursor && cursor.id !== '/') {
      crumbs.unshift(cursor)
      cursor = cursor.parentId ? nodeById.get(cursor.parentId) : undefined
    }
    return crumbs
  }

  function renderEntry(node: CatalogNode, compact = false) {
    const isDirectory = node.kind === 'directory'
    const isCurrent = nodeById.has(node.id)
    const isVideo = /\.(mp4|m4v|webm|ogv|mov|mkv)$/i.test(node.name)
    const isImage = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(node.name)
    const canPreview = !isDirectory && (isVideo || isImage)
    const canOpen = (isDirectory && isCurrent) || canPreview
    const Icon = isDirectory ? Folder : FileVideo2
    const count = isDirectory && isCurrent ? childNodes(node.id, nodes).length : undefined
    return <article className={`entry-row ${compact ? 'entry-compact' : ''}`} key={node.id}>
      {isCurrent && <EntryCheckbox node={node} mark={selectionMarks.get(node.id) ?? 'unchecked'} onToggle={toggleNode} />}
      {canOpen ? <button className="entry-icon" onClick={() => isDirectory ? openDirectory(node) : openPreview(node)} aria-label={isDirectory ? `Abrir ${node.name}` : `Vista previa ${node.name}`}>
        <Icon size={19} strokeWidth={1.8} />
      </button> : <span className="entry-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.8}/></span>}
      {canOpen ? <button className="entry-details" onClick={() => isDirectory ? openDirectory(node) : openPreview(node)}>
        <strong>{node.name}</strong>
        <span>{!isCurrent ? `Ya no aparece en el índice · ${node.relativePath}` : isDirectory ? `${count} elementos directos` : node.relativePath}</span>
        {!isDirectory && <small className="entry-metadata">{formatBytes(node.sizeBytes)}{node.sizeExact === false ? ' aprox.' : ''}{node.mimeType ? ` · ${node.mimeType}` : ''}{node.modifiedAt ? ` · ${node.modifiedAt}` : ''}</small>}
      </button> : <div className="entry-details"><strong>{node.name}</strong><span>{!isCurrent ? `Ya no aparece en el índice · ${node.relativePath}` : isDirectory ? 'Carpeta' : node.relativePath}</span></div>}
      <span className="entry-size">{isDirectory ? 'Carpeta' : `${node.sizeExact === false ? '≈ ' : ''}${formatBytes(node.sizeBytes)}`}</span>
      {canPreview && <button className="icon-button" aria-label={`Vista previa ${node.name}`} onClick={() => openPreview(node)}><Eye size={17}/></button>}
      <button
        className={`icon-button favorite-button ${favorites.has(node.id) ? 'is-favorite' : ''}`}
        aria-label={favorites.has(node.id) ? `Quitar ${node.name} de favoritos` : `Añadir ${node.name} a favoritos`}
        onClick={() => void toggleFavorite(node.id)}
      ><Heart size={18} fill={favorites.has(node.id) ? 'currentColor' : 'none'} /></button>
      {isDirectory && isCurrent && <button className="icon-button" aria-label={`Abrir ${node.name}`} onClick={() => openDirectory(node)}><ChevronRight size={18} /></button>}
    </article>
  }

  function renderSeriesGroup(group: ReturnType<typeof groupRelatedSeries>[number]) {
    const fileIds = group.members.flatMap((member) => descendantFiles(member.id, nodes).map((file) => file.id))
    const selectedCount = fileIds.reduce((count, id) => count + Number(selectedIds.has(id)), 0)
    const mark = selectedCount === 0 ? 'unchecked' : selectedCount === fileIds.length ? 'checked' : 'partial'
    const toggleGroup = () => setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of fileIds) {
        if (mark === 'checked') next.delete(id)
        else next.add(id)
      }
      return next
    })
    return <section className="series-group-card" key={group.id} aria-label={`Grupo de serie ${group.title}`}>
      <div className="series-group-head">
        <input className="check-input" type="checkbox" checked={mark === 'checked'} ref={(element) => { if (element) element.indeterminate = mark === 'partial' }} onChange={toggleGroup} aria-label={`Seleccionar ${group.title} completa`} />
        <span className="series-mark"><Sparkles size={19}/></span>
        <div className="series-group-copy"><strong>{group.title}</strong><span>{group.members.length} carpetas relacionadas · agrupadas por nombre, con rutas originales</span></div>
        <span className="match-confidence">Coincidencia alta</span>
      </div>
      <div className="series-members">{group.members.map((member) => <div className="series-member" key={member.id}>
        <EntryCheckbox node={member} mark={selectionMarks.get(member.id) ?? 'unchecked'} onToggle={toggleNode}/><span className="member-folder"><Folder size={16}/></span>
        <button className="entry-details" onClick={() => openDirectory(member)}><strong>{member.name}</strong><span>{member.relativePath}</span></button>
        <button className="icon-button" aria-label={`Abrir ${member.name}`} onClick={() => openDirectory(member)}><ChevronRight size={17}/></button>
      </div>)}</div>
      <div className="series-group-foot"><span>{group.matchRule} · puedes elegir una carpeta por separado.</span><button className="text-button" onClick={toggleGroup}>{mark === 'checked' ? 'Quitar selección' : 'Seleccionar grupo'}</button></div>
    </section>
  }

  const selectionToolbar = selection.fileCount > 0 && <div className="selection-bar" role="region" aria-label="Resumen de selección">
    <div><strong>{selection.fileCount} {selection.fileCount === 1 ? 'archivo seleccionado' : 'archivos seleccionados'}</strong><span>{formatBytes(selection.knownBytes)} conocidos{selection.unknownSizeCount ? ` · ${selection.unknownSizeCount} sin tamaño` : ''}</span></div>
    <button className="button button-secondary" onClick={() => void enqueueSelection()}><Download size={17}/>Poner en cola</button>
    <button className="button button-primary" onClick={() => openListDialog('append')}><ListIcon size={17} />Añadir a lista</button>
    <button className="icon-button" aria-label="Limpiar selección" onClick={() => setSelectedIds(new Set())}><X size={18} /></button>
  </div>

  function renderSyncCard() {
    const running = syncState.phase === 'running'
    const paused = syncState.phase === 'paused'
    const completed = syncState.phase === 'complete'
    const partial = syncState.phase === 'partial'
    return <section className={`sync-card ${completed ? 'sync-complete' : ''}`} aria-live="polite">
      <span className="sync-icon">{running ? <LoaderCircle className="spin" size={20} /> : completed ? <Check size={20} /> : <Sparkles size={19} />}</span>
      <div className="sync-copy">
        <strong>{running ? 'Actualizando tu biblioteca' : completed ? 'Biblioteca sincronizada' : partial ? 'Biblioteca actualizada parcialmente' : paused ? 'Sincronización pausada' : exampleMode ? 'Preparamos una pequeña vista de ejemplo' : 'Tu biblioteca está lista'}</strong>
        <span>{running ? `${syncState.directoriesDone} carpetas revisadas · ${syncState.filesFound} archivos encontrados${(syncState.deferredDirectories ?? 0) > 0 ? ` · ${syncState.deferredDirectories} en espera${syncState.nextRetryAt ? `; próximo intento ${new Date(syncState.nextRetryAt).toLocaleTimeString('es')}` : ''}` : ''}` : paused ? `${syncState.directoriesDone} carpetas guardadas. Puedes continuar cuando quieras.` : partial ? `${syncState.directoriesDone} carpetas revisadas · ${syncState.filesFound.toLocaleString('es')} archivos · ${syncState.deferredDirectories ?? 0} carpetas pendientes de reintento` : completed ? `${syncState.filesFound.toLocaleString('es')} archivos · índice local listo` : exampleMode ? 'La muestra es orientativa. La sincronización directa puede pausarse y continuar.' : 'Tus carpetas y archivos guardados se pueden consultar sin conexión.'}</span>
        {syncState.lastError && <span className="inline-error">{syncState.lastError}</span>}
      </div>
      {running
        ? <button className="button button-secondary" onClick={pauseSync}><Pause size={16} />Pausar</button>
        : catalogOnline || !nativePlatform
          ? <button className="button button-primary" onClick={() => void startSync()}><Download size={16} />{paused ? 'Continuar' : partial ? `Reintentar ${syncState.deferredDirectories ?? ''} carpetas` : completed ? 'Actualizar índice' : 'Sincronizar directamente'}</button>
          : nativePlatform
            ? <button className="button button-secondary" onClick={() => void retryNativeConnection()} disabled={connectionChecking}><Wifi size={16}/>{connectionChecking ? 'Comprobando…' : 'Probar conexión'}</button>
          : <span className="sync-offline"><WifiOff size={15} />Catálogo sin conexión</span>}
      {nativePlatform && connectionError && <span className="inline-error" role="status">{connectionError}</span>}
    </section>
  }

  function renderHome() {
    const homeFolders = childNodes('/', nodes).filter((node) => node.kind === 'directory')
    return <>
      <div className="welcome-row">
        <div><p className="eyebrow">Tu biblioteca personal</p><h1>Encuentra lo que buscas.<br className="desktop-break" /> Descarga a tu ritmo.</h1><p className="page-subtitle">Explora, guarda tus favoritos y retoma tus listas cuando vuelvas.</p></div>
        <div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-folder"><FolderOpen size={52} strokeWidth={1.35}/></div><Sparkles className="art-spark" size={22}/></div>
      </div>
      {renderSyncCard()}
      <div className="section-heading"><div><h2>Explora por categorías</h2><span>Abre una carpeta para ver qué contiene</span></div><button className="text-button" onClick={() => navigate('explore')}>Ver biblioteca <ChevronRight size={16}/></button></div>
      <div className="category-grid">
        {homeFolders.map((folder, index) => <button className={`category-card category-${index % 4}`} key={folder.id} onClick={() => openDirectory(folder)}>
          <span className="category-art"><Folder size={30} strokeWidth={1.5}/></span><strong>{folder.name}</strong><small>{childNodes(folder.id, nodes).length} carpetas y archivos guardados</small><ChevronRight className="category-arrow" size={17}/>
        </button>)}
      </div>
      <div className="section-heading recent-heading"><div><h2>Acceso rápido</h2><span>Elementos que has guardado para volver después</span></div><button className="text-button" onClick={() => navigate('favorites')}>Ver favoritos <ChevronRight size={16}/></button></div>
      {favoriteNodes.length ? <div className="entry-list">{favoriteNodes.slice(0, 4).map((node) => renderEntry(node, true))}</div> : <div className="empty-card"><Bookmark size={23}/><strong>Tus favoritos aparecerán aquí</strong><span>Toca el corazón de una carpeta o archivo para guardarlo.</span></div>}
    </>
  }

  function renderExplore() {
    const crumbs = crumbNodes()
    const searching = query.trim().length > 0
    const matchingGroups = seriesGroups.filter((group) => group.members.some((member) => searchResults.some((result) => result.node.id === member.id)))
    const groupedMemberIds = new Set(matchingGroups.flatMap((group) => group.members.map((member) => member.id)))
    const otherResults = searchResults.filter(({ node }) => !groupedMemberIds.has(node.id))
    return <>
      <div className="breadcrumb" aria-label="Ruta de navegación">
        <button onClick={() => setCurrentPath('/')}>Biblioteca</button>
        {crumbs.map((crumb) => <span key={crumb.id} className="breadcrumb-part"><ChevronRight size={14}/><button onClick={() => setCurrentPath(crumb.id)}>{crumb.name}</button></span>)}
      </div>
      <div className="page-title-row"><div><p className="eyebrow">{searching ? 'Búsqueda en el dispositivo' : 'Explorar carpetas'}</p><h1>{searching ? 'Resultados' : currentNode?.name ?? 'Biblioteca'}</h1><p className="page-subtitle">{searching ? `Coincidencias para “${query}” en el índice guardado.` : 'Navega por el contenido y selecciona solo lo que quieres guardar.'}</p></div>
        {!searching && <button className="button button-secondary" onClick={() => void (nativePlatform && !catalogOnline ? retryNativeConnection() : startSync())} disabled={syncState.phase === 'running' || connectionChecking}><Download size={16}/>{nativePlatform && !catalogOnline ? connectionChecking ? 'Comprobando…' : 'Probar conexión' : 'Actualizar índice'}</button>}
      </div>
      {searching ? <>
        {currentSearchView?.pending ? <div className="result-count" role="status">Buscando en tu biblioteca…</div> : <>
          {correction && <div className="suggestion-card"><Sparkles size={18}/><span>¿Quizás quisiste decir <strong>{correction}</strong>?</span><button className="text-button" onClick={() => setQuery(correction)}>Buscar sugerencia</button></div>}
          <div className="result-count">{searchResults.length} {searchResults.length === 1 ? 'resultado' : 'resultados'}{exampleMode ? ' · muestra local de ejemplo' : ' · búsqueda sin conexión'}</div>
          {currentSearchView?.failed
            ? <div className="empty-card"><Search size={23}/><strong>La búsqueda no pudo completarse</strong><span>Vuelve a escribir tu consulta para intentarlo otra vez.</span></div>
            : searchResults.length ? <>
              {matchingGroups.map(renderSeriesGroup)}
              {otherResults.length > 0 && <div className="entry-list">{otherResults.map(({ node }) => renderEntry(node))}</div>}
            </> : <div className="empty-card"><Search size={23}/><strong>No encontramos “{query}”</strong><span>Prueba con menos palabras o revisa cómo se escribe el nombre.</span></div>}
        </>}
      </> : <>
        {renderSyncCard()}
        <div className="browse-toolbar"><span>{folders.length} {folders.length === 1 ? 'carpeta' : 'carpetas'} · {files.length} {files.length === 1 ? 'archivo' : 'archivos'} en esta ubicación</span>{currentChildren.length > 0 && <button className="text-button" onClick={() => {
          setSelectedIds((current) => currentChildren.reduce((next, node) => toggleSelection(node.id, nodes, next), current))
        }}>Seleccionar contenido</button>}</div>
        {folders.length > 0 && <div className="folder-grid">{folders.map((folder, index) => <article className={`folder-card folder-${index % 4}`} key={folder.id}>
          <button className="folder-card-main" onClick={() => openDirectory(folder)}><span className="folder-card-visual"><FolderOpen size={31} strokeWidth={1.5}/></span><strong>{folder.name}</strong><small>{childNodes(folder.id, nodes).length} elementos directos</small><ChevronRight className="folder-card-arrow" size={17}/></button><button className={`nested-heart ${favorites.has(folder.id) ? 'is-favorite' : ''}`} aria-label={`Marcar ${folder.name} favorito`} onClick={() => void toggleFavorite(folder.id)}><Heart size={16} fill={favorites.has(folder.id) ? 'currentColor' : 'none'}/></button>
        </article>)}</div>}
        {files.length > 0 && <><div className="section-heading file-heading"><div><h2>Archivos</h2><span>Marca varios o guarda uno en favoritos</span></div></div><div className="entry-list">{files.map((file) => renderEntry(file))}</div></>}
        {currentChildren.length === 0 && <div className="empty-card"><Folder size={22}/><strong>Esta carpeta todavía está vacía</strong><span>Conéctate y sincroniza para ver su contenido.</span></div>}
      </>}
    </>
  }

  function renderFavorites() {
    return <><div className="page-title-row"><div><p className="eyebrow">Colección personal</p><h1>Favoritos</h1><p className="page-subtitle">Carpetas y archivos que guardaste para encontrarlos rápido.</p></div></div>
      {favoriteNodes.length ? <div className="entry-list">{favoriteNodes.map((node) => renderEntry(node))}</div> : <div className="empty-card"><Heart size={23}/><strong>Aún no tienes favoritos</strong><span>Cuando encuentres algo que te guste, toca el corazón.</span><button className="button button-primary" onClick={() => navigate('explore')}>Explorar biblioteca</button></div>}
    </>
  }

  function renderLists() {
    return <><div className="page-title-row"><div><p className="eyebrow">Preparar para después</p><h1>Mis listas</h1><p className="page-subtitle">Tus selecciones se guardan en este dispositivo.</p></div><button className="button button-primary" onClick={() => { setSelectedIds(new Set()); openListDialog('create') }}><ListIcon size={16}/>Nueva lista</button></div>
      {lists.length ? <div className="lists-grid">{lists.map((list, index) => <section className="list-card" key={list.id}><div className="list-card-head"><span className="list-icon"><ListIcon size={20}/></span><div><strong>{list.name}</strong><small>{list.itemIds.length} {list.itemIds.length === 1 ? 'elemento' : 'elementos'} · actualizada {new Date(list.updatedAt).toLocaleDateString('es')}</small></div><button className="icon-button" aria-label={`Subir lista ${list.name}`} disabled={index === 0} onClick={() => void moveList(list, -1)}><ChevronUp size={16}/></button><button className="icon-button" aria-label={`Bajar lista ${list.name}`} disabled={index === lists.length - 1} onClick={() => void moveList(list, 1)}><ChevronDown size={16}/></button><button className="icon-button" aria-label={`Duplicar lista ${list.name}`} onClick={() => void duplicateList(list)}><Copy size={15}/></button><button className="icon-button" aria-label={`Renombrar lista ${list.name}`} onClick={() => openListDialog('rename', list)}><Pencil size={16}/></button><button className="icon-button danger-hover" aria-label={`Eliminar lista ${list.name}`} onClick={() => void removeList(list)}><X size={17}/></button></div>
        <div className="list-items">{list.itemIds.slice(0, 4).map((id) => {
          const current = nodeById.get(id)
          const item = current ?? list.itemSnapshots?.[id]
          return item ? <div className={`list-item ${current ? '' : 'list-item-stale'}`} key={id}><span>{item.kind === 'directory' ? <Folder size={16}/> : <FileVideo2 size={16}/>}</span><div className="list-item-copy"><strong>{item.name}</strong>{!current && <small>Ya no aparece en el índice · {item.relativePath}</small>}</div><button className="icon-button" aria-label={`Quitar ${item.name} de ${list.name}`} onClick={() => void removeListItem(list, id)}><X size={15}/></button></div> : <div className="list-item missing-item" key={id}>Elemento fuera del índice guardado</div>
        })}{list.itemIds.length > 4 && <small className="more-items">y {list.itemIds.length - 4} elementos más</small>}<button className="button button-secondary list-download-button" onClick={() => openDownloadPlan(list.itemIds)}><Download size={15}/>Preparar descarga</button></div>
      </section>)}</div> : <div className="empty-card"><ListIcon size={24}/><strong>Empieza una lista cuando quieras</strong><span>Selecciona carpetas o archivos, revisa el tamaño y guárdalos para después.</span><button className="button button-primary" onClick={() => navigate('explore')}>Elegir contenido</button></div>}
    </>
  }

  function renderDownloads() {
    const labels: Record<string, string> = { queued: 'En cola', downloading: 'Descargando', paused: 'Pausada', completed: 'Completada', error: 'Requiere atención' }
    if (!nativePlatform && !gatewayOnline) return <><div className="page-title-row"><div><p className="eyebrow">Descargas del navegador</p><h1>Descargas</h1><p className="page-subtitle">Los archivos se abren directamente desde UCLV y se guardan según la configuración de tu navegador.</p></div><button className="button button-secondary" onClick={() => navigate('explore')}>Explorar</button></div><section className="download-info"><span className="download-info-icon"><HardDriveDownload size={23}/></span><div><strong>Destino: Descargas del navegador</strong><p>El navegador administra el espacio y el avance. Para una cola reanudable que siga funcionando con la app cerrada, usa la APK.</p></div><CircleHelp size={19}/></section>{downloadMessage && <div className="download-message" role="status"><span>{downloadMessage}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setDownloadMessage('')}><X size={16}/></button></div>}<div className="empty-card"><Download size={24}/><strong>Revisa el avance en tu navegador</strong><span>Abre el menú del navegador y entra en Descargas para ver los archivos que empezaron.</span></div></>
    if (nativePlatform && !nativeDestination?.supported) return <><div className="page-title-row"><div><p className="eyebrow">Transferencias guardadas</p><h1>Descargas</h1><p className="page-subtitle">Este Android no tiene disponible el destino seguro de descargas.</p></div></div><section className="download-info"><span className="download-info-icon"><HardDriveDownload size={23}/></span><div><strong>Destino predeterminado: {downloadSnapshot.destination || 'Comprobando…'}</strong><p>{nativeDestination?.spaceError || 'El destino y el espacio todavía no están disponibles.'}</p></div><CircleHelp size={19}/></section><div className="empty-card"><HardDriveDownload size={24}/><strong>Destino Android no compatible</strong><span>Puedes seguir explorando y guardar favoritos y listas. No se habilitan transferencias si Android no puede proteger el destino.</span></div></>
    return <><div className="page-title-row"><div><p className="eyebrow">Transferencias guardadas</p><h1>Descargas</h1><p className="page-subtitle">La cola y los archivos parciales se guardan en este dispositivo.</p></div><button className="button button-secondary" onClick={() => void refreshDownloads()}><Clock3 size={16}/>Actualizar</button></div>
      <section className="download-info"><span className="download-info-icon"><HardDriveDownload size={23}/></span><div><strong>Destino predeterminado para nuevas descargas: {downloadSnapshot.destination || 'Cargando carpeta…'}</strong><p>{destinationReady ? `${formatBytes(downloadSnapshot.freeBytes)} disponibles · ` : ''}{gatewayOnline ? 'Cada trabajo conserva su propio destino.' : nativePlatform ? 'Las descargas de Android se guardan y se pueden reanudar desde esta lista.' : 'El navegador administra las descargas directas desde UCLV.'}</p></div><CircleHelp size={19}/></section>
      {downloadMessage && <div className="download-message" role="status"><span>{downloadMessage}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setDownloadMessage('')}><X size={16}/></button></div>}
      {downloadSnapshot.jobs.length ? <div className="download-jobs">{downloadSnapshot.jobs.map((job) => {
        const total = job.items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
        const done = job.items.reduce((sum, item) => sum + Math.min(item.bytesDone, item.sizeBytes ?? item.bytesDone), 0)
        const percent = total > 0 ? Math.min(100, done / total * 100) : job.status === 'completed' ? 100 : 0
        const remaining = job.items.filter((item) => item.status !== 'completed').length
        return <section className="download-job" key={job.id}><div className="download-job-top"><span className={`job-status job-${job.status}`}><span/>{labels[job.status] ?? job.status}</span><strong>{job.items.length} {job.items.length === 1 ? 'archivo' : 'archivos'} · {formatBytes(total || undefined)}</strong></div>
          <div className="download-job-destination"><span>Destino de esta lista</span><strong>{job.destination}</strong><small>{job.destinationFreeBytes === undefined ? 'Espacio disponible no consultable' : `${formatBytes(job.destinationFreeBytes)} disponibles`}</small></div>
          <div className="download-job-progress" role="progressbar" aria-label="Progreso de la lista" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></div>
          <div className="download-job-detail"><span>{formatBytes(done)} de {total ? formatBytes(total) : 'tamaño por determinar'}{remaining ? ` · ${remaining} pendientes` : ''}</span><span>{Math.round(percent)}%</span></div>
        <div className="download-job-items">{job.items.slice(0, 8).map((item) => <div className="download-job-item" key={item.id}><FileVideo2 size={15}/><span>{item.name}</span><small>{item.status === 'completed' ? 'Lista' : item.error || `${formatBytes(item.bytesDone)}${item.sizeBytes ? ` / ${item.sizeExact === false ? '≈ ' : ''}${formatBytes(item.sizeBytes)}` : ''}`}</small></div>)}{job.items.length > 8 && <small className="more-items">y {job.items.length - 8} archivos más</small>}</div>
          <div className="download-job-actions">{['queued', 'downloading'].includes(job.status) && <button className="button button-secondary" onClick={() => void mutateDownload(`/api/downloads/${job.id}/pause`, 'POST')}><Pause size={15}/>Pausar</button>}{['paused', 'error'].includes(job.status) && <button className="button button-primary" onClick={() => void mutateDownload(`/api/downloads/${job.id}/resume`, 'POST')}><Download size={15}/>Reanudar</button>}{job.status !== 'downloading' && <button className="button button-secondary" onClick={() => void mutateDownload(`/api/downloads/${job.id}`, 'DELETE')}><X size={15}/>Quitar</button>}</div>
        </section>
      })}</div> : <div className="empty-card"><Download size={24}/><strong>Tu cola está vacía</strong><span>Busca un archivo, selecciónalo y ponlo en cola.</span><button className="button button-primary" onClick={() => navigate('explore')}>Explorar contenido</button></div>}
    </>
  }

  function renderSettings() {
    return <><div className="page-title-row"><div><p className="eyebrow">Ajustar a tu dispositivo</p><h1>Ajustes</h1><p className="page-subtitle">Preferencias claras. Las cambiamos cuando tú quieras.</p></div></div>
      {downloadMessage && <div className="download-message" role="status"><span>{downloadMessage}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setDownloadMessage('')}><X size={16}/></button></div>}
      <div className="settings-list">
        <section className="setting-row"><span className="setting-icon"><HardDriveDownload size={19}/></span><div><strong>Carpeta de descarga</strong><small id="destination-help">{nativePlatform ? nativeDestination?.supported ? `Destino Android: ${nativeDestination.destination}. ${typeof nativeDestination.freeBytes === 'number' ? `${formatBytes(nativeDestination.freeBytes)} libres en el volumen.` : nativeDestination.spaceError || 'Espacio no disponible.'} La selección de otra carpeta se habilitará más adelante.` : nativeDestination?.spaceError || 'Comprobando el destino de este dispositivo…' : vercelCatalog && !apiBase ? 'El navegador guarda en su carpeta de Descargas y no informa el espacio libre de esa carpeta.' : 'Predeterminada: Descargas/Descargar UCLV.'}</small></div>{vercelCatalog && !apiBase ? <div className="setting-destination-control"><label className="visually-hidden" htmlFor="destination-path">Carpeta predeterminada</label><input id="destination-path" value="Download" readOnly aria-describedby="destination-help"/><span className="setting-value">Predeterminada</span></div> : <form className="setting-destination-control" onSubmit={(event) => void saveDestination(event)}><label className="visually-hidden" htmlFor="destination-path">Ruta de descarga predeterminada</label><input id="destination-path" aria-describedby="destination-help" value={destinationDraft} onChange={(event) => setDestinationDraft(event.target.value)} placeholder="Ruta completa de Descargas" disabled={nativePlatform || !gatewayOnline}/><button type="submit" className="button button-secondary" disabled={nativePlatform || !gatewayOnline || !destinationDraft.trim()}>Guardar</button></form>}</section>
        <section className="setting-row"><span className="setting-icon"><Wifi size={19}/></span><div><strong>Conexión al catálogo</strong><small>{nativePlatform ? catalogOnline ? 'Android se conecta directamente por HTTPS a visuales.uclv.cu.' : connectionError || 'Android intenta conectarse directamente; el índice guardado sigue disponible.' : gatewayOnline ? 'Esta aplicación consulta el índice directamente desde este equipo. Las imágenes y los vídeos también se abren desde UCLV.' : 'La web consulta el catálogo por el servicio de UCLV Media. Las imágenes y los vídeos se abren directamente desde UCLV.'}</small></div>{nativePlatform && !catalogOnline && <button className="button button-secondary" onClick={() => void retryNativeConnection()} disabled={connectionChecking}>{connectionChecking ? 'Comprobando…' : 'Probar conexión'}</button>}<span className={`service-status ${catalogOnline ? 'online' : ''}`}>{catalogOnline ? 'Conectado' : 'Desconectado'}</span></section>
        <section className="setting-row"><span className="setting-icon"><Clock3 size={19}/></span><div><strong>Reintentos</strong><small>Hasta 2 reintentos automáticos por carpeta, con esperas crecientes. El índice queda guardado para continuar después.</small></div><span className="setting-value">Limitados y recuperables</span></section>
        <section className="setting-row"><span className="setting-icon"><Bookmark size={19}/></span><div><strong>Datos guardados</strong><small>{nodes.length.toLocaleString('es')} elementos · {favorites.size} favoritos · {lists.length} listas</small></div><span className="service-status online">En este dispositivo</span></section>
        <section className="setting-row"><span className="setting-icon"><HardDriveDownload size={19}/></span><div><strong>Protección del índice</strong><small>{browserStorage?.persistent === true
          ? 'El navegador concedió protección ante limpieza automática por espacio. El índice y su punto de continuación quedan aquí; conserva también una copia aparte.'
          : browserStorage?.persistent === false
            ? 'El navegador puede liberar estos datos si necesita espacio. Crea una copia de seguridad para guardarla aparte.'
            : browserStorage?.supported === false
              ? 'Este navegador no informa si puede proteger el almacenamiento local. Usa la copia de seguridad para conservar otra copia.'
              : 'Consultando el almacenamiento de este dispositivo…'}{browserStorage?.usageBytes !== undefined && browserStorage.quotaBytes !== undefined
          ? ` Uso estimado: ${formatBytes(browserStorage.usageBytes)} de ${formatBytes(browserStorage.quotaBytes)}.` : ''}</small></div>{browserStorage?.persistent !== true && browserStorage?.supported && <button className="button button-secondary" onClick={() => void requestPersistentStorage().then(setBrowserStorage)}>Proteger índice</button>}</section>
        <section className="setting-row backup-row"><span className="setting-icon"><FileDown size={19}/></span><div><strong>Copia de seguridad</strong><small>Exporta el catálogo guardado, favoritos y listas a un archivo JSON. Las descargas y sus archivos parciales se guardan por separado.</small></div><div className="backup-actions"><button className="button button-secondary" onClick={() => void exportBackup()}><FileDown size={16}/>Crear copia</button><button className="button button-secondary" onClick={() => backupInputRef.current?.click()}><FileUp size={16}/>Revisar copia</button><input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Elegir archivo de copia de seguridad" onChange={(event) => void selectBackup(event.target.files?.[0])}/></div></section>
        {backupError && <p className="backup-error" role="alert">{backupError}</p>}
        {backupPreview && <section className="backup-preview" aria-live="polite"><strong>Revisa la copia antes de restaurarla</strong><span>{backupPreview.directoryCount} carpetas · {backupPreview.fileCount} archivos · {backupPreview.favoriteCount} favoritos · {backupPreview.listCount} listas</span><small>Creada el {new Date(backupPreview.createdAt).toLocaleString('es')}. La restauración reemplaza el catálogo, favoritos y listas de este dispositivo; puedes cancelar ahora.</small><div><button className="button button-secondary" onClick={() => { setBackupPreview(null); if (backupInputRef.current) backupInputRef.current.value = '' }}>Cancelar</button><button className="button button-primary" onClick={() => void restoreBackup()}>Restaurar esta copia</button></div></section>}
      </div>
    </>
  }

  function screenContent() {
    if (query.trim() || currentScreen === 'explore') return renderExplore()
    if (currentScreen === 'favorites') return renderFavorites()
    if (currentScreen === 'lists') return renderLists()
    if (currentScreen === 'downloads') return renderDownloads()
    if (currentScreen === 'settings') return renderSettings()
    return renderHome()
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#inicio" onClick={(event) => { event.preventDefault(); navigate('home') }}><span className="brand-mark"><Download size={20}/></span><span><strong>UCLV Media</strong><small>Tu biblioteca, a tu ritmo</small></span></a>
      <div className="nav-label">Biblioteca</div>
      <nav className="primary-nav" aria-label="Navegación principal">{navigation.map(({ id, label, icon: Icon }) => <button className={`nav-item ${currentScreen === id ? 'active' : ''}`} key={id} onClick={() => navigate(id)}><Icon size={18}/><span>{label}</span>{id === 'lists' && lists.length > 0 && <span className="nav-count">{lists.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className={`gateway-pill ${catalogOnline ? 'gateway-online' : ''}`} onClick={() => navigate('settings')}><span className="gateway-dot"/><span>{nativePlatform ? catalogOnline ? 'Catálogo conectado' : 'Catálogo sin conexión' : 'Acceso directo a UCLV'}</span><ChevronRight size={14}/></button>
        <div className="sidebar-tip"><Sparkles size={16}/><span>Guarda tus listas. Las encuentras aquí cuando regreses.</span></div>
      </div>
    </aside>
    {mobileNavOpen && <button className="mobile-scrim" aria-label="Cerrar navegación" onClick={() => setMobileNavOpen(false)}/>}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Abrir menú" onClick={() => setMobileNavOpen(true)}><Menu size={21}/></button>
        <label className="search-box"><Search size={18}/><input ref={searchInputRef} aria-label="Buscar carpetas y archivos" placeholder="Busca una serie, película o carpeta…" value={query} onChange={(event) => startSearch(event.target.value)} /><kbd>⌘ K</kbd>{query && <button type="button" className="clear-search" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}><X size={16}/></button>}</label>
        <div className={`connection-chip ${catalogOnline ? 'connection-online' : ''}`}><span/>{catalogOnline ? 'Conectado' : 'Sin conexión'}</div>
        <button className="top-settings icon-button" aria-label="Abrir ajustes" onClick={() => navigate('settings')}><Settings size={19}/></button>
      </header>
      <div className="content-area">
        {busy ? <div className="loading-screen"><LoaderCircle className="spin"/><span>Abriendo tu biblioteca…</span></div> : screenContent()}
      </div>
      {selectionToolbar}
    </main>
    <nav className="mobile-tabbar" aria-label="Navegación inferior">{navigation.filter(({ id }) => ['home', 'explore', 'favorites', 'downloads'].includes(id)).map(({ id, label, icon: Icon }) => <button className={currentScreen === id ? 'active' : ''} key={id} onClick={() => navigate(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
    {dialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false) }}>
      <form className="list-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onSubmit={(event) => void saveList(event)}>
        <button className="dialog-close icon-button" type="button" aria-label="Cerrar" onClick={() => setDialogOpen(false)}><X size={19}/></button>
        <span className="dialog-icon"><ListIcon size={22}/></span><p className="eyebrow">Guardar para después</p><h2 id="dialog-title">{dialogMode === 'rename' ? 'Renombrar lista' : dialogMode === 'append' ? 'Añadir contenido a una lista' : 'Crea una lista'}</h2>
        <p>{dialogMode === 'rename' ? 'El cambio se guarda en este dispositivo.' : selection.fileCount === 1 ? 'Se guardará 1 archivo seleccionado. Puedes volver a esta lista cuando quieras.' : `Se guardarán ${selection.fileCount} archivos seleccionados. Puedes volver a esta lista cuando quieras.`}</p>
        {dialogMode === 'append' && lists.length > 0 && <><label className="field-label" htmlFor="target-list">Lista existente</label><select id="target-list" data-initial-focus value={dialogListId} onChange={(event) => setDialogListId(event.target.value)}><option value="">Crear una lista nueva</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></>}
        {(dialogMode === 'rename' || dialogMode === 'create' || (dialogMode === 'append' && !dialogListId)) && <><label className="field-label" htmlFor="list-name">Nombre de la lista</label><input id="list-name" data-initial-focus maxLength={60} placeholder="Por ejemplo, Ver el fin de semana" value={listName} onChange={(event) => { setListName(event.target.value); setDialogError('') }}/></>}
        {dialogError && <span className="field-error" role="alert">{dialogError}</span>}
        <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setDialogOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={!(dialogMode === 'append' && dialogListId) && !listName.trim()}><Check size={16}/>{dialogMode === 'rename' ? 'Guardar nombre' : dialogMode === 'append' && dialogListId ? 'Añadir elementos' : 'Guardar lista'}</button></div>
      </form>
    </div>}
    {previewNode && <div className="preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewNode(null) }}>
      <section className="media-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <button className="preview-close icon-button" data-initial-focus aria-label="Cerrar vista previa" onClick={() => setPreviewNode(null)}><X size={20}/></button>
        <div className="media-title"><span><Eye size={17}/></span><div><h2 id="preview-title">{previewNode.name}</h2><small>{previewNode.relativePath}</small></div></div>
        {(() => {
          const mediaUrl = sourceUrlForPath(previewNode.relativePath)
          return <>
            {/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(previewNode.name)
              ? <img className="media-image" src={mediaUrl} alt={previewNode.name} />
              : <video className="media-video" controls preload="metadata" src={mediaUrl} aria-label={`Reproductor de ${previewNode.name}`} />}
            <div className="media-actions">
              {directBrowserMedia
                ? <a className="button button-primary" href={mediaUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Abrir archivo desde UCLV</a>
                : <button className="button button-primary" onClick={() => { setPreviewNode(null); openDownloadPlan([previewNode.id]) }}><Download size={16}/>Añadir a descargas</button>}
              {!directBrowserMedia && <a className="text-button media-original" href={mediaUrl} target="_blank" rel="noreferrer">Abrir el archivo original</a>}
            </div>
            {directBrowserMedia && <p className="media-direct-note">La vista previa se reproduce directamente desde UCLV. Chrome administra la apertura o descarga del archivo.</p>}
          </>
        })()}
      </section>
    </div>}
    {pendingDownloadPlan && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDownloadPlan(null) }}>
      <section className="download-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="download-plan-title">
        <button className="dialog-close icon-button" data-initial-focus aria-label="Cerrar revisión" onClick={() => setPendingDownloadPlan(null)}><X size={19}/></button>
        <span className="dialog-icon"><HardDriveDownload size={22}/></span><p className="eyebrow">Antes de empezar</p><h2 id="download-plan-title">Revisa la descarga</h2>
        <p>Seleccionaste {pendingSummary.fileCount} {pendingSummary.fileCount === 1 ? 'archivo' : 'archivos'}. Puedes pausarlos y reanudarlos desde Descargas.</p>
        <div className="plan-summary-grid"><div><small>Tamaño conocido</small><strong>{formatBytes(pendingSummary.knownBytes)}</strong></div><div><small>Espacio disponible</small><strong>{mobileBrowserRemote ? 'Chrome lo comprobará' : destinationReady ? formatBytes(downloadSnapshot.freeBytes) : 'Aún no disponible'}</strong></div></div>
        <div className="plan-destination"><HardDriveDownload size={16}/><span><strong>Se guardarán en</strong><small>{mobileBrowserRemote ? 'Descargas de Chrome en este teléfono' : destinationReady ? downloadSnapshot.destination || 'Destino no disponible' : 'Destino aún no disponible'}</small></span></div>
        {pendingSummary.unknownSizeCount > 0 && <p className="plan-warning" role="status">{pendingSummary.unknownSizeCount} archivos no tienen tamaño conocido. {mobileBrowserRemote ? 'Chrome comprobará el espacio disponible al iniciar.' : 'El motor volverá a comprobar el espacio mientras descarga.'}</p>}
        {pendingDuplicates > 0 && <p className="plan-note">{pendingDuplicates} {pendingDuplicates === 1 ? 'archivo ya está' : 'archivos ya están'} en la cola. No se duplicará; puedes revisar o reanudar desde Descargas.</p>}
        {missingPendingCount > 0 && <p className="plan-warning">{missingPendingCount} elementos ya no aparecen en el índice guardado y no se añadirán.</p>}
        {destinationReady && pendingSummary.knownBytes > downloadSnapshot.freeBytes && <p className="plan-warning" role="status">El tamaño del índice es orientativo. La descarga intentará continuar y se detendrá solo si el sistema no puede guardar más datos; el avance quedará disponible para reanudar.</p>}
        {pendingNodes.length > 0 && <p className="gateway-requirement">{nativePlatform ? nativeDestination?.supported ? 'Android descargará directamente desde UCLV y guardará la cola en este teléfono para reanudarla.' : 'Android no informa un destino compatible con MediaStore. La selección se conserva en tus listas.' : gatewayOnline ? 'La aplicación descargará directamente desde UCLV y conservará la cola en este equipo.' : 'Los archivos se abrirán directamente desde UCLV. El navegador administra las descargas y su avance.'}</p>}
        <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPendingDownloadPlan(null)}>Volver</button><button type="button" className="button button-primary" disabled={(!newPendingNodes.length && pendingDuplicates === 0) || (nativePlatform && !nativeDestination?.supported)} onClick={() => void confirmDownloadPlan()}><Download size={16}/>{!newPendingNodes.length && pendingDuplicates > 0 && (nativePlatform || gatewayOnline) ? 'Ver descargas' : nativePlatform || gatewayOnline ? 'Añadir a la cola' : 'Enviar al navegador'}</button></div>
      </section>
    </div>}
  </div>
}

export default App
