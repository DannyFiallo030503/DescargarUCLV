# Sistemas y prerrequisitos de desarrollo

## 1. Arquitectura de despliegue prevista

- Web: cliente estático PWA servido por HTTPS; almacenamiento local y service worker. La comunicación con `visuales.uclv.cu` depende de CORS o del mecanismo que se confirme en descubrimiento.
- Android: shell Capacitor 8.6 con `compileSdk/targetSdk 36`. El build requiere Android SDK y Android Studio compatible. Descarga persistente requiere un port de API y un worker nativo (WorkManager/servicio foreground según el perfil de transferencia), MediaStore/SAF y validación Range/ETag; el shell actual no integra el gateway Node.
- Escritorio Linux: shell Electron que empaqueta el frontend y el gateway Node local. El gateway escucha en loopback, sirve la interfaz y consulta el origen directamente desde el equipo; no requiere cuenta, backend ni servicio de nube. `npm run desktop:linux` produce un `.deb` para Ubuntu/Debian, cuyo instalador configura el sandbox de Chromium. El paquete incluye Electron/Chromium y es mayor que una PWA; el renderer conserva sandbox, aislamiento de contexto y Node.js desactivado.
- Sin cuenta, base ni servicio de nube en V1. Backend o proxy de mismo origen solo si CORS/índice hacen inviable la web estática; registrar seguridad, operación y privacidad antes de incorporarlo.

## 2. Entorno de desarrollo

| Sistema | Necesario |
|---|---|
| Todos | Git, Node.js compatible con la versión vigente de Vite/Capacitor, gestor de paquetes versionado, TypeScript, editor con lint/format y Chrome/Chromium actual para inspección y E2E. |
| Web/PWA | Navegador HTTPS/localhost, DevTools, perfil limpio para instalar/uninstall, capacidades offline y site storage. |
| Android APK | Capacitor 8 con Android SDK API 36 y JDK 21. Android Studio es opcional si se instala el SDK y se compila con Gradle Wrapper. Faltan pruebas en dispositivo físico de Downloads/MediaStore, reinicio/background, batería y permisos. |
| Linux escritorio | Node.js 24 para desarrollo, dependencias npm fijadas y escritorio X11/Wayland. El paquete `.deb` instala Electron/Chromium con su sandbox estándar. |
| Windows (siguiente target) | Usar la misma shell y gateway; añadir target NSIS/portable y verificar empaquetado/rutas en Windows. No prometer binario Windows construido desde Linux sin configurar y validar el toolchain de destino. |
| macOS | Sin target elegido; evaluar por separado si se solicita. |

Versiones actuales web/Capacitor se fijan en `package.json`/lockfile y ADR de implementación. El project Android sincroniza `compileSdk/targetSdk 36` del paquete Capacitor 8. No actualizar major automáticamente durante una fase de release.

## 3. Datos e infraestructura de desarrollo

- Fixtures sanitizados del índice de Apache y listados pequeños; archivo binario fixture mínimo para Range/ETag.
- Fixture sintético de 30k documentos buscables más directorios y relaciones de temporada para ranking/performance; no asumir que el snapshot histórico contiene archivos.
- Simulador local de HTTP con Range, desconexiones y errores controlados; no montar un mirror real ni descargar desde UCLV para pruebas repetidas.
- Almacenamiento local descartable para pruebas de migración, distinto del perfil personal de producción.
- Perfiles de navegador limpios y carpeta Downloads temporal/local para validar selección/espacio cuando el navegador permita medirlo.
- No hay AppHost Aspire ni infraestructura remota planificada en esta fase. Si se añade un AppHost después, aplicar instrucciones globales de Aspire y reutilizar sus recursos.

## 4. Sistemas necesarios en ejecución

1. Conexión HTTPS al origen para indexar/previsualizar/descargar; cada operación debe degradar a catálogo offline cuando pierda acceso.
2. Almacenamiento local persistente para DB y temporal `.part`; revisar cuota/espacio al comenzar y escribir por streaming.
3. Permiso de destino vigente. Web depende de navegador y gesto; Android de MediaStore/SAF; Desktop de carpeta seleccionada.
4. Notificaciones no obligatorias para utilidad básica; instalar plugin/permiso solo si la experiencia de progreso lo requiere.
5. Soporte del origen para Range, Content-Range y validador remoto para reanudar de forma segura; sin ello, explicar reinicio completo.

## 5. Criterios para decidir si hace falta backend

**No añadir backend** si la PWA puede enumerar/descargar el sitio con CORS, o si el producto web puede limitarse a abrir el enlace dejando APK/Desktop para gestión nativa. Considerar proxy/backend solo si: (a) el usuario necesita indexación en web, (b) CORS lo impide, (c) se puede operar cerca del origen, y (d) hay controles para limitar host/ruta, tamaño, concurrencia y abuse. Nunca crear un proxy abierto.
