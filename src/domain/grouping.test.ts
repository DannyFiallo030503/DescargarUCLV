import { describe, expect, it } from 'vitest'
import { fixtureCatalog } from './fixtures'
import { groupRelatedSeries } from './grouping'

describe('series grouping', () => {
  it('groups related Fairy Tail folders without replacing their source paths', () => {
    const [group] = groupRelatedSeries(fixtureCatalog)
    expect(group?.title).toBe('Fairy Tail')
    expect(group?.members).toHaveLength(5)
    expect(group?.members.map((member) => member.relativePath)).toContain('/Infantiles/Animes/FairyTail - Final Series/')
    expect(group?.confidence).toBeGreaterThan(0.9)
  })

  it('does not invent a group from a single match', () => {
    const one = fixtureCatalog.filter((node) => node.id === '/Infantiles/Animes/FairyTail/')
    expect(groupRelatedSeries(one)).toEqual([])
  })
})
