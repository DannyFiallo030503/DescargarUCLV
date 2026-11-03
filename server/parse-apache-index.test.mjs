import { describe, expect, it } from 'vitest'
import { parseApacheIndex } from './parse-apache-index.mjs'

const base = 'https://visuales.uclv.cu/Infantiles/Animes/'

describe('Apache index parser', () => {
  it('reads file metadata and encoded directory names from an Apache table', () => {
    const html = `<!doctype html><table>
      <tr><td>[DIR]</td><td><a href="FairyTail%20%282014%29/">FairyTail (2014)/</a></td><td>2026-01-01</td><td>-</td></tr>
      <tr><td>[VID]</td><td><a href="episode.mp4">episode.mp4</a></td><td>2026-01-01</td><td>1.5G</td></tr>
    </table>`
    const entries = parseApacheIndex(html, base)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ name: 'FairyTail (2014)', kind: 'directory', relativePath: `${base.slice('https://visuales.uclv.cu'.length)}FairyTail (2014)/` })
    expect(entries[1]).toMatchObject({ name: 'episode.mp4', kind: 'file', sizeBytes: 1610612736 })
  })

  it('ignores parent links, query controls and cross-origin anchors', () => {
    const html = `<table>
      <tr><td></td><td><a href="../">Parent Directory</a></td><td></td><td>-</td></tr>
      <tr><td></td><td><a href="?C=N;O=D">Name</a></td><td></td><td>-</td></tr>
      <tr><td></td><td><a href="https://example.invalid/leak.mp4">leak.mp4</a></td><td></td><td>2M</td></tr>
    </table>`
    expect(parseApacheIndex(html, base)).toEqual([])
  })

  it('does not follow encoded path traversal outside the current directory', () => {
    const html = `<table><tr><td></td><td><a href="%2e%2e/secret.mp4">secret.mp4</a></td><td></td><td>2M</td></tr></table>`
    expect(parseApacheIndex(html, base)).toEqual([])
  })

  it('preserves literal percent signs in unescaped Apache links', () => {
    const html = `<table><tr><td></td><td><a href="OVA 100%.mp4">OVA 100%.mp4</a></td><td></td><td>12M</td></tr></table>`
    expect(parseApacheIndex(html, base)).toMatchObject([{
      name: 'OVA 100%.mp4',
      relativePath: '/Infantiles/Animes/OVA 100%.mp4',
      sourceUrl: 'https://visuales.uclv.cu/Infantiles/Animes/OVA%20100%25.mp4',
    }])
  })

  it('skips a malformed encoded row without failing the rest of the listing', () => {
    const html = `<table>
      <tr><td></td><td><a href="broken%FF.mp4">broken%FF.mp4</a></td><td></td><td>1M</td></tr>
      <tr><td></td><td><a href="usable.mp4">usable.mp4</a></td><td></td><td>2M</td></tr>
    </table>`
    expect(parseApacheIndex(html, base).map((entry) => entry.name)).toEqual(['usable.mp4'])
  })
})
