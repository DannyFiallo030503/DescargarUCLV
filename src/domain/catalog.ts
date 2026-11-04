export type NodeKind = 'directory' | 'file'

export interface CatalogNode {
  id: string
  parentId: string | null
  parentPath: string
  relativePath: string
  name: string
  kind: NodeKind
  sizeBytes?: number
  sizeLabel?: string
  sourceUrl?: string
  modifiedAt?: string
}

export type SelectionMark = 'checked' | 'partial' | 'unchecked'

export interface SelectionSummary {
  fileCount: number
  knownBytes: number
  unknownSizeCount: number
}

const childIndexCache = new WeakMap<CatalogNode[], Map<string | null, CatalogNode[]>>()

function indexedChildren(nodes: CatalogNode[]): Map<string | null, CatalogNode[]> {
  const cached = childIndexCache.get(nodes)
  if (cached) return cached
  const index = new Map<string | null, CatalogNode[]>()
  for (const node of nodes) {
    const siblings = index.get(node.parentId) ?? []
    siblings.push(node)
    index.set(node.parentId, siblings)
  }
  childIndexCache.set(nodes, index)
  return index
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 'Tamaño desconocido'
  if (value === 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const tier = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** tier).toLocaleString('es', { maximumFractionDigits: tier ? 1 : 0 })} ${units[tier]}`
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
}

export function childNodes(parentId: string | null, nodes: CatalogNode[]): CatalogNode[] {
  const result = [...(indexedChildren(nodes).get(parentId) ?? [])]
  return result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return naturalCompare(a.name, b.name)
  })
}

export function descendantFiles(nodeId: string, nodes: CatalogNode[]): CatalogNode[] {
  const byParent = indexedChildren(nodes)
  const found: CatalogNode[] = []
  const stack = [nodeId]
  const visited = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const child of byParent.get(current) ?? []) {
      if (child.kind === 'file') found.push(child)
      else stack.push(child.id)
    }
  }
  return found
}

export function resolveSelectedFiles(ids: Iterable<string>, nodes: CatalogNode[]): CatalogNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const files = new Map<string, CatalogNode>()
  const directories = new Set<string>()
  for (const id of ids) {
    const node = byId.get(id)
    if (!node) continue
    if (node.kind === 'file') files.set(node.id, node)
    else directories.add(node.id)
  }
  for (const id of directories) {
    let parentId = byId.get(id)?.parentId ?? null
    let hasSelectedParent = false
    while (parentId) {
      if (directories.has(parentId)) { hasSelectedParent = true; break }
      parentId = byId.get(parentId)?.parentId ?? null
    }
    if (!hasSelectedParent) for (const file of descendantFiles(id, nodes)) files.set(file.id, file)
  }
  return [...files.values()]
}

export function buildSelectionMarks(nodes: CatalogNode[], selectedIds: ReadonlySet<string>): Map<string, SelectionMark> {
  const byParent = indexedChildren(nodes)
  const statistics = new Map<string, { total: number; selected: number }>()
  const ordered = [...nodes].sort((a, b) => b.relativePath.split('/').length - a.relativePath.split('/').length)
  const marks = new Map<string, SelectionMark>()
  for (const node of ordered) {
    if (node.kind === 'file') {
      const selected = Number(selectedIds.has(node.id))
      statistics.set(node.id, { total: 1, selected })
      marks.set(node.id, selected ? 'checked' : 'unchecked')
      continue
    }
    let total = 0
    let selected = 0
    for (const child of byParent.get(node.id) ?? []) {
      const childStats = statistics.get(child.id)
      if (childStats) { total += childStats.total; selected += childStats.selected }
    }
    statistics.set(node.id, { total, selected })
    marks.set(node.id, total === 0 || selected === 0 ? 'unchecked' : selected === total ? 'checked' : 'partial')
  }
  return marks
}

export function selectionMark(nodeId: string, nodes: CatalogNode[], selectedIds: ReadonlySet<string>): SelectionMark {
  const files = nodes.find((node) => node.id === nodeId)?.kind === 'file'
    ? [nodes.find((node) => node.id === nodeId)!]
    : descendantFiles(nodeId, nodes)
  if (files.length === 0) return 'unchecked'
  const selectedCount = files.reduce((count, file) => count + Number(selectedIds.has(file.id)), 0)
  if (selectedCount === 0) return 'unchecked'
  if (selectedCount === files.length) return 'checked'
  return 'partial'
}

export function toggleSelection(nodeId: string, nodes: CatalogNode[], selectedIds: ReadonlySet<string>): Set<string> {
  const next = new Set(selectedIds)
  const node = nodes.find((item) => item.id === nodeId)
  if (!node) return next
  const files = node.kind === 'file' ? [node] : descendantFiles(nodeId, nodes)
  const remove = files.length > 0 && files.every((file) => next.has(file.id))
  for (const file of files) {
    if (remove) next.delete(file.id)
    else next.add(file.id)
  }
  return next
}

export function summarizeSelection(nodes: CatalogNode[], selectedIds: ReadonlySet<string>): SelectionSummary {
  let fileCount = 0
  let knownBytes = 0
  let unknownSizeCount = 0
  const unique = new Set(selectedIds)
  for (const id of unique) {
    const node = nodes.find((item) => item.id === id)
    if (!node || node.kind !== 'file') continue
    fileCount += 1
    if (node.sizeBytes === undefined) unknownSizeCount += 1
    else knownBytes += node.sizeBytes
  }
  return { fileCount, knownBytes, unknownSizeCount }
}
