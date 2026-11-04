const SOURCE_ORIGIN = 'https://visuales.uclv.cu'

/** Build a source URL from an indexed path without accepting an arbitrary host. */
export function sourceUrlForPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('La ruta del catálogo no es válida.')
  }
  const trailingSlash = path.endsWith('/')
  const segments = path.split('/').filter(Boolean).map((segment) => {
    if (!segment || segment === '.' || segment === '..' || /[\\\u0000-\u001f]/.test(segment)) {
      throw new Error('La ruta del catálogo no es válida.')
    }
    return encodeURIComponent(segment)
  })
  return `${SOURCE_ORIGIN}/${segments.join('/')}${trailingSlash && segments.length ? '/' : ''}`
}

export function isAllowedSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === SOURCE_ORIGIN && url.protocol === 'https:' && !url.username && !url.password
  } catch { return false }
}
