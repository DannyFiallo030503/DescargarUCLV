export default async function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  let catalogAvailable = false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  let current = new URL('https://visuales.uclv.cu/')
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const upstream = await fetch(current, { signal: controller.signal, headers: { accept: 'text/html' }, redirect: 'manual' })
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get('location')
        await upstream.body?.cancel()
        if (!location || redirects === 3) break
        const next = new URL(location, current)
        if (next.protocol !== 'https:' || next.origin !== 'https://visuales.uclv.cu') break
        current = next
        continue
      }
      catalogAvailable = upstream.ok && (upstream.headers.get('content-type') || '').includes('html')
      await upstream.body?.cancel()
      break
    }
  } catch { catalogAvailable = false }
  finally { clearTimeout(timeout) }
  response.status(200).json({ ok: catalogAvailable, catalogAvailable, downloadsAvailable: false, vercelMode: true })
}
