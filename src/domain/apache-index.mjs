import { parse } from 'parse5'

function textContent(node) {
  if (node.nodeName === '#text') return node.value
  return (node.childNodes || []).map(textContent).join('')
}

function findElements(node, tagName, output = []) {
  if (node.tagName === tagName) output.push(node)
  for (const child of node.childNodes || []) findElements(child, tagName, output)
  return output
}

function parseSize(label) {
  const match = label.trim().replaceAll(',', '').match(/^(\d+(?:\.\d+)?)\s*([KMGTP])?$/i)
  if (!match) return undefined
  const power = { '': 0, K: 1, M: 2, G: 3, T: 4, P: 5 }[match[2]?.toUpperCase() || '']
  return Math.floor(Number(match[1]) * 1024 ** power)
}

function safeDecodedPath(url) {
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => {
    let decoded
    try { decoded = decodeURIComponent(segment) } catch { throw new Error('El enlace contiene codificación inválida.') }
    if (decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f]/.test(decoded)) {
      throw new Error('El enlace contiene una ruta no permitida.')
    }
    return decoded
  })
  if (segments.length === 0) return '/'
  return `/${segments.join('/')}${url.pathname.endsWith('/') ? '/' : ''}`
}

function normalizeHrefEncoding(href) {
  return href.replace(/%(?![\da-f]{2})/gi, '%25')
}

export function parseApacheIndex(html, directoryUrl) {
  const base = new URL(directoryUrl)
  const safeBasePath = safeDecodedPath(base)
  const document = parse(html)
  const rows = findElements(document, 'tr')
  const entries = []
  const seen = new Set()

  for (const row of rows) {
    const cells = findElements(row, 'td')
    if (cells.length < 2) continue
    const anchor = findElements(cells[1], 'a')[0]
    const href = anchor?.attrs?.find((attribute) => attribute.name === 'href')?.value
    if (!href || href.startsWith('?') || href === '../' || href === './') continue
    let remote
    try { remote = new URL(normalizeHrefEncoding(href), base) } catch { continue }
    if (remote.protocol !== 'https:' || remote.origin !== base.origin || remote.search || remote.hash) continue
    let relativePath
    try { relativePath = safeDecodedPath(remote) } catch { continue }
    if (!relativePath.startsWith(safeBasePath)) continue
    const isDirectory = href.endsWith('/')
    const name = textContent(anchor).trim().replace(/\/$/, '')
    if (!name || name === 'Parent Directory') continue
    const sizeLabel = cells[3] ? textContent(cells[3]).trim() : ''
    if (seen.has(relativePath)) continue
    seen.add(relativePath)
    entries.push({
      id: relativePath,
      name,
      parentPath: safeDecodedPath(base),
      relativePath,
      kind: isDirectory ? 'directory' : 'file',
      sizeBytes: isDirectory ? undefined : parseSize(sizeLabel),
      sizeLabel: isDirectory ? undefined : sizeLabel || undefined,
      sourceUrl: remote.href,
    })
  }
  return entries
}
