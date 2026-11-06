import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import Portal from './Portal'
import './styles.css'
import './portal.css'

// The APK bundles its shell; keeping the web service worker out of the WebView
// avoids stale native bridge injection and leaves offline caching to the OS app.
const isDesktopShell = navigator.userAgent.toLowerCase().includes(' electron/')
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && !isDesktopShell && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' })
  }, { once: true })
}

const isLibrary = location.pathname === '/biblioteca' || location.pathname.startsWith('/biblioteca/')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLibrary ? <App /> : <Portal />}
  </React.StrictMode>,
)
