import { describe, expect, it } from 'vitest'
import { parseApacheIndex } from './apache-index.mjs'

describe('parseApacheIndex', () => {
  it('lee listados Apache en formato pre con directorios y archivos', () => {
    const html = `<html><body><h1>Index of /</h1><hr><pre>
<a href="../">../</a>                                      -
<a href="Documentales/">Documentales/</a>                 05-Aug-2026 23:17       -
<a href="Festivales%20y%20Premios%20de%20cine/">Festivales y Premios de cine/</a> 09-Mar-2026 22:45 -
<a href="video%20uno.mp4">video uno.mp4</a>             04-Nov-2026 12:30 4.2M
</pre></body></html>`

    expect(parseApacheIndex(html, 'https://visuales.uclv.cu/')).toEqual([
      expect.objectContaining({ id: '/Documentales/', name: 'Documentales', kind: 'directory', parentPath: '/' }),
      expect.objectContaining({ id: '/Festivales y Premios de cine/', kind: 'directory' }),
      expect.objectContaining({ id: '/video uno.mp4', name: 'video uno.mp4', kind: 'file', sizeLabel: '4.2M', sizeBytes: 4_404_019 }),
    ])
  })

  it('sigue leyendo el formato tabla anterior', () => {
    const html = '<table><tr><td>[VID]</td><td><a href="ep%201.mp4">ep 1.mp4</a></td><td></td><td>4M</td></tr></table>'
    expect(parseApacheIndex(html, 'https://visuales.uclv.cu/Anime/Serie/')).toEqual([
      expect.objectContaining({ id: '/Anime/Serie/ep 1.mp4', name: 'ep 1.mp4', kind: 'file', sizeLabel: '4M' }),
    ])
  })
})
