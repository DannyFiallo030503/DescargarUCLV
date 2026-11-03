import type { CatalogNode } from './catalog'
import { normalizeSearchText } from './catalog'

export interface CatalogGroup {
  id: string
  title: string
  members: CatalogNode[]
  matchRule: string
  confidence: number
}

export function groupRelatedSeries(nodes: CatalogNode[]): CatalogGroup[] {
  const members = nodes.filter((node) => {
    if (node.kind !== 'directory') return false
    const normalized = normalizeSearchText(node.name).replace(/\s+/g, ' ')
    return normalized === 'fairy tail' || normalized.startsWith('fairy tail ') || normalized.startsWith('fairytail')
  })
  if (members.length < 2) return []
  return [{
    id: 'series:fairy-tail',
    title: 'Fairy Tail',
    members: members.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'es', { numeric: true, sensitivity: 'base' })),
    matchRule: 'Nombre de carpeta contiene Fairy Tail',
    confidence: 0.94,
  }]
}
