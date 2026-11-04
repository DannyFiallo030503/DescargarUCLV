import { describe, expect, it } from 'vitest'
import { fixtureCatalog } from './fixtures'
import {
  childNodes, formatBytes, normalizeSearchText, resolveSelectedFiles, selectionMark, summarizeSelection, toggleSelection,
} from './catalog'
import { searchCatalog, suggestCorrection } from './search'

describe('catalog domain', () => {
  it('normalizes accents, case and punctuation without changing the displayed name', () => {
    expect(normalizeSearchText('  PELÍCULAS—Anime!! ')).toBe('peliculas anime')
  })

  it('keeps the hierarchy visible while returning only direct children', () => {
    expect(childNodes('/Infantiles/Animes/', fixtureCatalog).map((node) => node.name)).toEqual([
      'Fairy Tail', 'Fairy Tail (2014)', 'Fairy Tail Final Series', 'Películas Anime',
    ])
  })

  it('selects descendants and reports partial parent state', () => {
    const season = '/Infantiles/Animes/FairyTail/'
    const first = `${season}Fairy001.mp4`
    let selected = toggleSelection(first, fixtureCatalog, new Set())
    expect(selectionMark(season, fixtureCatalog, selected)).toBe('partial')
    selected = toggleSelection(season, fixtureCatalog, selected)
    expect(selectionMark(season, fixtureCatalog, selected)).toBe('checked')
    expect(summarizeSelection(fixtureCatalog, selected).fileCount).toBe(3)
    selected = toggleSelection(season, fixtureCatalog, selected)
    expect(selectionMark(season, fixtureCatalog, selected)).toBe('unchecked')
  })

  it('expands selected folders to unique file nodes for a download plan', () => {
    const season = '/Infantiles/Animes/FairyTail/'
    const first = `${season}Fairy001.mp4`
    const files = resolveSelectedFiles([season, first], fixtureCatalog)
    expect(files).toHaveLength(3)
    expect(new Set(files.map((node) => node.id)).size).toBe(3)
    expect(files.every((node) => node.kind === 'file')).toBe(true)
  })

  it('deduplicates selected IDs and separates known and unknown sizes', () => {
    const selected = new Set([
      '/Infantiles/Animes/FairyTail/Fairy001.mp4',
      '/not-in-catalog',
      '/Infantiles/Animes/FairyTail/Fairy002.mp4',
    ])
    expect(summarizeSelection(fixtureCatalog, selected)).toEqual({ fileCount: 2, knownBytes: 146800640, unknownSizeCount: 0 })
  })

  it('formats byte values and unknown sizes explicitly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1048576)).toBe('1 MiB')
    expect(formatBytes(undefined)).toBe('Tamaño desconocido')
  })
})

describe('local fuzzy search', () => {
  it('finds a likely result despite a missing character', () => {
    const results = searchCatalog('fary tail', fixtureCatalog)
    expect(results.some(({ node }) => node.name === 'Fairy Tail')).toBe(true)
  })

  it('offers a correction without replacing the original query', () => {
    expect(suggestCorrection('Fairy Tial', fixtureCatalog)).toBe('Fairy Tail')
  })

  it('does not search for empty or one-character input', () => {
    expect(searchCatalog('', fixtureCatalog)).toEqual([])
    expect(searchCatalog('f', fixtureCatalog)).toEqual([])
  })
})
