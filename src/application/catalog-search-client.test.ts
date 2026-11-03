import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogNode } from '@/domain/catalog'
import { fixtureCatalog } from '@/domain/fixtures'
import { CatalogSearchClient } from './catalog-search-client'

describe('CatalogSearchClient', () => {
  it('uses the low-overhead local path for small catalogs', async () => {
    const view = await new CatalogSearchClient().search('Fairy Tial', fixtureCatalog)

    expect(view.correction).toBe('Fairy Tail')
    expect(view.results.some(({ node }) => node.name === 'Fairy Tail')).toBe(true)
  })

  it('keeps one search in flight and dispatches only the newest queued query', async () => {
    const workers: FakeWorker[] = []
    vi.stubGlobal('Worker', class extends FakeWorker {
      constructor() { super(); workers.push(this) }
    })
    const client = new CatalogSearchClient()
    const nodes = largeCatalog()

    const first = client.search('first', nodes)
    const superseded = client.search('superseded', nodes)
    const latest = client.search('latest', nodes)
    const worker = workers[0]

    expect(worker.messages.map((message) => message.type)).toEqual(['replace', 'search'])
    await expect(superseded).resolves.toEqual({ results: [] })
    worker.respond(1, [])
    expect(worker.messages.filter((message) => message.type === 'search').map((message) => message.query))
      .toEqual(['first', 'latest'])
    worker.respond(3, [])
    await expect(Promise.all([first, latest])).resolves.toEqual([
      { results: [], correction: undefined },
      { results: [], correction: undefined },
    ])
    client.dispose()
  })

  it('falls back to local search when the worker fails and settles pending work', async () => {
    const workers: FakeWorker[] = []
    vi.stubGlobal('Worker', class extends FakeWorker {
      constructor() { super(); workers.push(this) }
    })
    const client = new CatalogSearchClient()
    const nodes = largeCatalog()
    nodes[1] = { ...fixtureCatalog.find(({ name }) => name === 'Fairy Tail')!, id: '/Series/Fairy Tail/', relativePath: '/Series/Fairy Tail/' }
    const result = client.search('Fairy Tial', nodes)

    workers[0].onerror?.({} as ErrorEvent)
    await expect(result).resolves.toMatchObject({
      correction: 'Fairy Tail',
      results: expect.arrayContaining([expect.objectContaining({ node: expect.objectContaining({ name: 'Fairy Tail' }) })]),
    })
    client.dispose()
  })

  it('updates the ID map with committed records before resolving worker hits', async () => {
    const workers: FakeWorker[] = []
    vi.stubGlobal('Worker', class extends FakeWorker {
      constructor() { super(); workers.push(this) }
    })
    const client = new CatalogSearchClient()
    const nodes = largeCatalog()
    const query = client.search('fresh title', nodes)
    const added = { ...nodes[1], id: '/fresh title.mp4', name: 'Fresh title.mp4', relativePath: '/fresh title.mp4' }
    client.update([added])
    workers[0].respond(1, [{ id: added.id, score: 0, reason: 'starts-with' }])

    await expect(query).resolves.toMatchObject({ results: [{ node: added, score: 0, reason: 'starts-with' }] })
    client.dispose()
  })
})

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  messages: Array<Record<string, any>> = []
  postMessage(message: Record<string, any>) { this.messages.push(message) }
  terminate() {}
  respond(requestId: number, results: Array<Record<string, any>>) {
    this.onmessage?.({ data: { requestId, results } } as MessageEvent)
  }
}

function largeCatalog(): CatalogNode[] {
  return Array.from({ length: 5_000 }, (_, index) => ({
    id: `/catalog/${index}.mp4`, parentId: '/', parentPath: '/',
    relativePath: `/catalog/${index}.mp4`, name: `Catalog item ${index}.mp4`, kind: 'file' as const,
  }))
}

afterEach(() => vi.unstubAllGlobals())
