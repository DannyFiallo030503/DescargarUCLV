import type { CatalogNode } from '@/domain/catalog'
import { searchCatalog, suggestCorrection, type SearchResult } from '@/domain/search'
import type { SearchRecord, SearchResponse } from '@/domain/search-engine'

export interface CatalogSearchView {
  results: SearchResult[]
  correction?: string
}

interface SearchRequest {
  id: number
  query: string
  nodes: CatalogNode[]
  resolve: (view: CatalogSearchView) => void
}

type WorkerResponse = SearchResponse & { requestId: number }
const workerCatalogThreshold = 5_000

export class CatalogSearchClient {
  private worker?: Worker
  private initialized = false
  private requestId = 0
  private active?: SearchRequest
  private queued?: SearchRequest
  private nodesById = new Map<string, CatalogNode>()

  search(query: string, nodes: CatalogNode[]): Promise<CatalogSearchView> {
    if (typeof Worker === 'undefined' || nodes.length < workerCatalogThreshold) {
      return Promise.resolve(this.searchFallback(query, nodes))
    }
    try { this.ensureWorker(nodes) }
    catch { return Promise.resolve(this.searchFallback(query, nodes)) }
    return new Promise((resolve) => {
      const request = { id: ++this.requestId, query, nodes, resolve }
      if (this.active) {
        this.queued?.resolve({ results: [] })
        this.queued = request
      } else this.dispatch(request)
    })
  }

  update(entries: CatalogNode[]): void {
    if (!this.worker || !this.initialized) return
    this.storeNodes(entries)
    try { this.worker.postMessage({ type: 'update', records: entries.map(toRecord) }) }
    catch { this.failWorker() }
  }

  replace(nodes: CatalogNode[]): void {
    this.nodesById = new Map(nodes.map((node) => [node.id, node]))
    if (!this.worker) return
    try {
      this.worker.postMessage({ type: 'replace', records: nodes.map(toRecord) })
      this.initialized = true
    } catch { this.failWorker() }
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.initialized = false
    this.active?.resolve({ results: [] })
    this.queued?.resolve({ results: [] })
    this.active = undefined
    this.queued = undefined
  }

  private ensureWorker(nodes: CatalogNode[]): void {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/catalog-search.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleResult(event.data)
      this.worker.onerror = () => this.failWorker()
      this.worker.onmessageerror = () => this.failWorker()
    }
    if (!this.initialized) {
      this.nodesById = new Map(nodes.map((node) => [node.id, node]))
      this.worker.postMessage({ type: 'replace', records: nodes.map(toRecord) })
      this.initialized = true
    }
  }

  private dispatch(request: SearchRequest): void {
    this.active = request
    try { this.worker!.postMessage({ type: 'search', requestId: request.id, query: request.query }) }
    catch { this.failWorker() }
  }

  private handleResult(message: WorkerResponse): void {
    if (!this.active || message.requestId !== this.active.id) return
    this.active.resolve({
      results: message.results.flatMap((hit) => {
        const node = this.nodesById.get(hit.id)
        return node ? [{ node, score: hit.score, reason: hit.reason }] : []
      }),
      correction: message.correction,
    })
    this.active = undefined
    if (this.queued) {
      const next = this.queued
      this.queued = undefined
      this.dispatch(next)
    }
  }

  private failWorker(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.initialized = false
    for (const request of [this.active, this.queued]) {
      if (request) request.resolve(this.searchFallback(request.query, request.nodes))
    }
    this.active = undefined
    this.queued = undefined
  }

  private searchFallback(query: string, nodes: CatalogNode[]): CatalogSearchView {
    return { results: searchCatalog(query, nodes), correction: suggestCorrection(query, nodes) }
  }

  private storeNodes(nodes: CatalogNode[]): void {
    for (const node of nodes) this.nodesById.set(node.id, node)
  }
}

function toRecord({ id, name, relativePath }: CatalogNode): SearchRecord {
  return { id, name, relativePath }
}
