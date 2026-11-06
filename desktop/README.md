# Descargar UCLV para Linux

La app carga una copia local de la interfaz y arranca el gateway incluido en este equipo. El gateway escucha solo en `127.0.0.1`; sus peticiones HTTPS a `visuales.uclv.cu` salen por la conexión y VPN configuradas en Linux. No se requiere cuenta ni servidor remoto.

## Ejecutar desde el repositorio

```sh
npm ci
npm run desktop:run
```

## Crear el paquete para Ubuntu/Debian

```sh
npm ci
npm run desktop:linux
```

El paquete `.deb` queda en `release/`. Instálalo con el instalador de paquetes de Ubuntu/Debian para que Chromium configure correctamente su sandbox. El programa se instala bajo `/opt/Descargar-UCLV` (sin espacios para compatibilidad con el helper SUID de Chromium), y el acceso del menú se llama **Descargar UCLV**. El estado durable de la cola queda en el directorio de datos de la app; los archivos se guardan en `~/Downloads/Descargar UCLV` de forma predeterminada. Cerrar la app detiene el worker; los trabajos pendientes se recuperan al abrirla de nuevo.

La aplicación Linux y la APK acceden a UCLV directamente desde el dispositivo. La PWA alojada sigue limitada por CORS del sitio de UCLV.
