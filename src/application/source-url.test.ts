import { describe, expect, it } from 'vitest'
import { isAllowedSourceUrl, sourceUrlForPath } from './source-url'

describe('catalog source URLs', () => {
  it('encodes decoded path segments, spaces, and literal percent signs', () => {
    expect(sourceUrlForPath('/Anime/Fairy Tail/OVA 100%/')).toBe('https://visuales.uclv.cu/Anime/Fairy%20Tail/OVA%20100%25/')
  })

  it('rejects authority, traversal, and backslash paths', () => {
    for (const path of ['//example.com/a', '/Anime/../secret', '/Anime\\secret']) {
      expect(() => sourceUrlForPath(path)).toThrow()
    }
  })

  it('allows only HTTPS URLs on the fixed source host', () => {
    expect(isAllowedSourceUrl('https://visuales.uclv.cu/a')).toBe(true)
    expect(isAllowedSourceUrl('https://visuales.uclv.cu.evil/a')).toBe(false)
    expect(isAllowedSourceUrl('http://visuales.uclv.cu/a')).toBe(false)
  })
})
