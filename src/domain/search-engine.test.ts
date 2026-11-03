import { describe, expect, it } from 'vitest'
import { CatalogSearchEngine } from './search-engine'

const root = { id: '/', name: 'Biblioteca', relativePath: '/' }

describe('CatalogSearchEngine used by the search worker', () => {
  it('returns direct path matches without initializing Fuse', () => {
    const engine = new CatalogSearchEngine([root, {
      id: '/Series/Fairy Tail/', name: 'Fairy Tail', relativePath: '/Series/Fairy Tail/',
    }])

    expect(engine.search('series fairy tail').results.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: '/Series/Fairy Tail/', reason: 'contains' },
    ])
  })

  it('handles a typo and suggests a correction in the worker response', () => {
    const engine = new CatalogSearchEngine([root, {
      id: '/Series/Fairy Tail/', name: 'Fairy Tail', relativePath: '/Series/Fairy Tail/',
    }])

    expect(engine.search('Fairy Tial')).toMatchObject({
      results: [{ id: '/Series/Fairy Tail/', reason: 'similar' }],
      correction: 'Fairy Tail',
    })
  })

  it('adds committed catalog entries without losing the previous search index', () => {
    const engine = new CatalogSearchEngine([root])
    engine.search('missing title')
    engine.update([{ id: '/new title.mp4', name: 'new title.mp4', relativePath: '/new title.mp4' }])

    expect(engine.search('new title').results.map(({ id }) => id)).toContain('/new title.mp4')
  })

  it('updates an existing identifier in place after a catalog rescan', () => {
    const engine = new CatalogSearchEngine([{ id: '/old name.mp4', name: 'old name.mp4', relativePath: '/old name.mp4' }])
    engine.search('old nmae')
    engine.update([{ id: '/old name.mp4', name: 'new name.mp4', relativePath: '/new name.mp4' }])

    expect(engine.search('old name').results.every(({ reason }) => reason === 'similar')).toBe(true)
    expect(engine.search('new name').results).toMatchObject([{ id: '/old name.mp4', reason: 'starts-with' }])
  })

  it('replaces restored catalog data and removes stale entries', () => {
    const engine = new CatalogSearchEngine([{ id: '/old.mp4', name: 'old.mp4', relativePath: '/old.mp4' }])
    engine.replace([{ id: '/new.mp4', name: 'new.mp4', relativePath: '/new.mp4' }])

    expect(engine.search('old.mp4').results).toEqual([])
    expect(engine.search('new.mp4').results.map(({ id }) => id)).toEqual(['/new.mp4'])
  })
})
