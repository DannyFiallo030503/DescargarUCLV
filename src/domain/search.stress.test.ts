import { afterEach, describe, expect, it } from 'vitest'
import type { CatalogNode } from './catalog'
import { searchCatalog } from './search'

declare const process: {
  memoryUsage: () => { heapUsed: number }
  stdout: { write: (value: string) => void }
}

const originalLog = console.info
afterEach(() => { console.info = originalLog })

function makeCatalog(count: number): CatalogNode[] {
  const nodes: CatalogNode[] = [{
    id: '/', parentId: null, parentPath: '', relativePath: '/', name: 'Biblioteca', kind: 'directory',
  }]
  for (let i = 1; i < count; i += 1) {
    const series = `Serie ${Math.floor(i / 100)}`
    nodes.push({
      id: `/anime/${series}/${series} episodio ${i}.mkv`,
      parentId: `/anime/${series}/`,
      parentPath: `/anime/${series}/`,
      relativePath: `/anime/${series}/${series} episodio ${i}.mkv`,
      name: `${series} episodio ${i}.mkv`,
      kind: 'file',
      sizeBytes: 500_000_000 + i,
    })
  }
  return nodes
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] ?? 0
}

describe('stress: motor de búsqueda local', () => {
  it.each([30_000, 100_000])('informa tiempo y memoria con %s entradas', (count) => {
    const memoryBefore = process.memoryUsage().heapUsed
    const nodes = makeCatalog(count)
    const startBuild = performance.now()
    const firstResults = searchCatalog('serie 245 episodio 24501', nodes)
    const buildMs = performance.now() - startBuild
    const memoryAfter = process.memoryUsage().heapUsed
    const samples: number[] = []
    for (let i = 0; i < 30; i += 1) {
      const start = performance.now()
      const episode = i * 13
      searchCatalog(`serie ${Math.floor(episode / 100)} episodio ${episode}`, nodes)
      samples.push(performance.now() - start)
    }
    const fuzzyStart = performance.now()
    const fuzzyResults = searchCatalog('sere 245 episod 24501', nodes)
    const fuzzyMs = performance.now() - fuzzyStart
    const metrics = {
      count,
      firstSearchAndIndexMs: Math.round(buildMs),
      queryP50Ms: Number(percentile(samples, 0.5).toFixed(2)),
      queryP95Ms: Number(percentile(samples, 0.95).toFixed(2)),
      firstFuzzyQueryMs: Math.round(fuzzyMs),
      heapDeltaMiB: Number(((memoryAfter - memoryBefore) / 1024 / 1024).toFixed(1)),
    }
    process.stdout.write(`[stress-search] ${JSON.stringify(metrics)}\n`)
    expect(firstResults.length).toBeGreaterThan(0)
    expect(firstResults.some(({ node }) => node.id.includes('episodio 24501'))).toBe(true)
    expect(fuzzyResults.some(({ node }) => node.id.includes('episodio 24501'))).toBe(true)
    expect(samples.every(Number.isFinite)).toBe(true)
  })
})
