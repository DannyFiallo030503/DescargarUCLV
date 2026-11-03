import Fuse from 'fuse.js'
import { normalizeSearchText } from './catalog'

export interface SearchRecord {
  id: string
  name: string
  relativePath: string
}

export interface SearchHit {
  id: string
  score: number
  reason: 'exact' | 'starts-with' | 'contains' | 'similar'
}

export interface SearchResponse {
  results: SearchHit[]
  correction?: string
}

interface PreparedRecord extends SearchRecord {
  text: string
  normalizedName: string
}

export class CatalogSearchEngine {
  private prepared: PreparedRecord[] = []
  private byId = new Map<string, PreparedRecord>()
  private positionById = new Map<string, number>()
  private fuzzy?: Fuse<{ id: string; name: string }>

  constructor(records: SearchRecord[] = []) {
    this.replace(records)
  }

  replace(records: SearchRecord[]): void {
    this.prepared = []
    this.byId.clear()
    this.positionById.clear()
    this.fuzzy = undefined
    this.update(records)
  }

  update(records: SearchRecord[]): void {
    const changedIds = new Set(records.map(({ id }) => id))
    if (this.fuzzy && changedIds.size) this.fuzzy.remove((item) => changedIds.has(item.id))
    for (const record of records) {
      const prepared: PreparedRecord = {
        ...record,
        text: normalizeSearchText(`${record.relativePath} ${record.name}`),
        normalizedName: normalizeSearchText(record.name),
      }
      const position = this.positionById.get(record.id)
      if (position === undefined) {
        this.positionById.set(record.id, this.prepared.length)
        this.prepared.push(prepared)
      } else this.prepared[position] = prepared
      this.byId.set(record.id, prepared)
      this.fuzzy?.add({ id: record.id, name: prepared.normalizedName })
    }
  }

  search(query: string, limit = 40): SearchResponse {
    const normalizedQuery = normalizeSearchText(query)
    if (normalizedQuery.length < 2) return { results: [] }
    const direct: SearchHit[] = []
    for (const item of this.prepared) {
      if (!item.text.includes(normalizedQuery)) continue
      const reason: SearchHit['reason'] = item.normalizedName === normalizedQuery ? 'exact'
        : item.normalizedName.startsWith(normalizedQuery) ? 'starts-with' : 'contains'
      const score = reason === 'exact' ? -2 : reason === 'starts-with' ? -1 : -0.5
      direct.push({ id: item.id, score, reason })
    }
    if (direct.length) {
      direct.sort((a, b) => a.score - b.score || this.byId.get(a.id)!.name.localeCompare(this.byId.get(b.id)!.name, 'es'))
      return { results: direct.slice(0, limit) }
    }

    const matches = this.fuzzyIndex().search(normalizedQuery, { limit: limit * 2 })
    const results = matches.map((match) => ({
      id: match.item.id,
      score: match.score ?? 1,
      reason: 'similar' as const,
    })).sort((a, b) => a.score - b.score || this.byId.get(a.id)!.name.localeCompare(this.byId.get(b.id)!.name, 'es')).slice(0, limit)
    const best = matches[0]
    const correction = best && (best.score ?? 1) <= 0.34 && best.item.name !== normalizedQuery
      ? this.byId.get(best.item.id)?.name
      : undefined
    return { results, correction }
  }

  private fuzzyIndex(): Fuse<{ id: string; name: string }> {
    return this.fuzzy ??= new Fuse(this.prepared.map((item) => ({ id: item.id, name: item.normalizedName })), {
      keys: ['name'], includeScore: true, threshold: 0.42, ignoreLocation: true, minMatchCharLength: 2,
    })
  }
}
