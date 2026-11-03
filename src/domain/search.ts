import type { CatalogNode } from './catalog'
import { CatalogSearchEngine, type SearchHit } from './search-engine'

export interface SearchResult {
  node: CatalogNode
  score: number
  reason: SearchHit['reason']
}

interface SearchIndex {
  engine: CatalogSearchEngine
  nodesById: Map<string, CatalogNode>
}

const searchCache = new WeakMap<CatalogNode[], SearchIndex>()

function getSearchIndex(nodes: CatalogNode[]): SearchIndex {
  const existing = searchCache.get(nodes)
  if (existing) return existing
  const index: SearchIndex = {
    engine: new CatalogSearchEngine(nodes.map(({ id, name, relativePath }) => ({ id, name, relativePath }))),
    nodesById: new Map(nodes.map((node) => [node.id, node])),
  }
  searchCache.set(nodes, index)
  return index
}

export function searchCatalog(query: string, nodes: CatalogNode[], limit = 40): SearchResult[] {
  const index = getSearchIndex(nodes)
  return index.engine.search(query, limit).results.flatMap((hit) => {
    const node = index.nodesById.get(hit.id)
    return node ? [{ node, score: hit.score, reason: hit.reason }] : []
  })
}

export function suggestCorrection(query: string, nodes: CatalogNode[]): string | undefined {
  return getSearchIndex(nodes).engine.search(query).correction
}
