export default async function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  let catalogAvailable = false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const upstream = await fetch('https://visuales.uclv.cu/', { signal: controller.signal, headers: { accept: 'text/html' }, redirect: 'error' })
    catalogAvailable = upstream.ok && (upstream.headers.get('content-type') || '').includes('html')
    await upstream.body?.cancel()
  } catch { catalogAvailable = false }
  finally { clearTimeout(timeout) }
  response.status(200).json({ ok: catalogAvailable, catalogAvailable, downloadsAvailable: false, vercelMode: true })
}
