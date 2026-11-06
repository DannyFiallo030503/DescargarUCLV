import { ArrowDownToLine, ArrowRight, CircleHelp, Code2, Download, Globe2, HardDriveDownload, Monitor, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

type DownloadInfo = { platform: string; version: string; name: string; fileName: string; url: string | null; format: string; status: string; notes: string }
type StatusInfo = { updatedAt: string; label: string; milestones: { id: string; title: string; status: string; summary: string; note: string }[] }
const repo = 'https://github.com/DannyFiallo030503/DescargarUCLV'
const releasePage = `${repo}/releases`

export default function Portal() {
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [status, setStatus] = useState<StatusInfo | null>(null)

  useEffect(() => {
    Promise.all([fetch('/downloads/versions.json').then(r => r.json()), fetch('/project-status.json').then(r => r.json())])
      .then(([versions, progress]) => { setDownloads(versions.downloads); setStatus(progress) })
      .catch(() => {})
  }, [])

  const android = downloads.find(item => item.platform === 'android')
  const linux = downloads.find(item => item.platform === 'linux')
  const milestones = status?.milestones ?? []

  return <main className="portal">
    <div className="portal-wrap">
      <header className="portal-nav">
        <a className="portal-brand" href="/" aria-label="Descargar UCLV, inicio"><span className="brand-symbol"><ArrowDownToLine size={21}/></span><span>Descargar UCLV<small>Biblioteca multimedia personal</small></span></a>
        <nav aria-label="Navegación principal"><a href="#apps">Aplicaciones</a><a href="#avance">Avance</a><a className="repo-link" href={repo} target="_blank" rel="noreferrer"><Code2 size={15}/> Código fuente</a></nav>
      </header>

      <section className="portal-hero">
        <div className="hero-copy"><div className="portal-eyebrow"><i/> Proyecto personal en desarrollo</div>
          <h1>Tu contenido.<br/><em>Tu biblioteca.</em></h1>
          <p>Una aplicación para explorar el catálogo de visuales.uclv.cu, organizar archivos y gestionar descargas desde tus propios dispositivos.</p>
          <div className="hero-actions"><a className="portal-button primary" href="#apps">Ver aplicaciones <ArrowRight size={16}/></a><a className="portal-button" href="/biblioteca">Abrir biblioteca web</a></div>
          <div className="hero-explainer"><CircleHelp size={16}/><span>Android y Linux se conectan directamente con UCLV desde tu dispositivo. El acceso al catálogo desde el navegador depende de CORS en el servidor de origen.</span></div>
        </div>
        <div className="portal-visual" aria-label="Ilustración de una aplicación de biblioteca y descargas"><div className="visual-halo"/><div className="visual-window"><div className="visual-bar"><i/><i/><i/><span>Descargar UCLV · Mi biblioteca</span></div><div className="visual-content"><label>DESCARGAS · ESTE DISPOSITIVO</label><strong>Tu cola, bajo control</strong><small>Archivos en progreso y listos para reanudar</small><div className="visual-row"><span className="visual-icon"><Download size={17}/></span><span><b>Descargas organizadas</b><small>Guardadas en este dispositivo</small></span><i>En cola</i></div><div className="visual-row"><span className="visual-icon"><Globe2 size={17}/></span><span><b>Catálogo local</b><small>Conserva el índice en tu equipo</small></span><i>Disponible</i></div><div className="visual-caption">Conexión directa <b>Android · Linux</b></div></div></div><div className="visual-badge"><HardDriveDownload size={17}/><span><b>Sin servidor intermediario</b><small>El tráfico va desde tu dispositivo a UCLV</small></span></div></div>
      </section>

      <section id="apps" className="portal-section"><div className="portal-section-heading"><div><label>ELIGE TU DISPOSITIVO</label><h2>Aplicaciones</h2></div><p>Instaladores disponibles y estado de cada plataforma.</p></div>
        <div className="app-cards">
          <article className="app-card"><div className="app-card-head"><span className="app-icon android"><Smartphone size={21}/></span><span><h3>Android</h3><small>APK para teléfonos y tabletas</small></span></div><p>Explora el índice local y administra la cola de descargas desde el teléfono.</p><div className="app-card-foot"><span><b>{android?.version ?? '0.1.3'}</b> · {android?.format ?? 'APK debug'}</span>{android?.url ? <a className="get-app" href={android.url} download><Download size={14}/> Descargar APK</a> : <span className="app-pending">Preparando</span>}</div><small className="card-note">{android?.notes ?? 'Compilación preparada.'}</small></article>
          <article className="app-card"><div className="app-card-head"><span className="app-icon linux"><Monitor size={21}/></span><span><h3>Linux</h3><small>Paquete DEB para Ubuntu y Debian</small></span></div><p>Consulta UCLV desde la computadora y conserva una cola de descargas local.</p><div className="app-card-foot"><span><b>{linux?.version ?? '0.1.3'}</b> · {linux?.format ?? 'DEB amd64'}</span><a className="get-app" href={releasePage} target="_blank" rel="noreferrer"><Download size={14}/> Ver versiones</a></div><small className="card-note">El instalador se distribuye por GitHub Releases.</small></article>
          <article className="app-card web-card"><div className="app-card-head"><span className="app-icon web"><Globe2 size={21}/></span><span><h3>Web / PWA</h3><small>Navegador y aplicación instalable</small></span></div><p>Este portal presenta el proyecto. La biblioteca web depende de que UCLV autorice CORS para leer sus carpetas.</p><div className="app-card-foot"><span><b>Portal</b> · informativo</span><a className="get-app secondary" href="/biblioteca">Abrir biblioteca <ArrowRight size={14}/></a></div></article>
        </div>
        <div className="portal-note"><CircleHelp size={17}/><span><b>Sobre las descargas:</b> los instaladores Android y Linux se conectan directamente desde el dispositivo con visuales.uclv.cu. Vercel sirve este portal; no participa en el catálogo ni en las transferencias.</span></div>
      </section>

      <section id="avance" className="progress-card"><div className="progress-heading"><div><label>ESTADO TRANSPARENTE</label><h2>Así avanza el proyecto</h2></div><span className="development-pill"><i/>{status?.label ?? 'En desarrollo'}</span></div><div className="milestone-grid">{milestones.map((item, i) => <article className="milestone" key={item.id}><span className="milestone-number">0{i + 1}</span><h3>{item.title}</h3><p>{item.summary}</p><small>{item.note}</small></article>)}</div><div className="updated-date">Actualizado: {status?.updatedAt ?? '2026-11-06'}</div></section>

      <footer className="portal-footer"><span>Proyecto personal e independiente. No está afiliado a la UCLV.</span><a href={repo} target="_blank" rel="noreferrer">Código y seguimiento del proyecto <ArrowRight size={14}/></a></footer>
    </div>
  </main>
}
