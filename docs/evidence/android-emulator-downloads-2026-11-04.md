# Validación de descargas Android en Maze Odyssey — 2026-11-04

## Entorno

- AVD existente: `MazeOdyssey36External`, Android 16 (API 36), x86_64.
- Emulator 37.2.13, con datos del AVD alojados en el disco externo y el SDK en `/var/tmp/maze-android-sdk`.
- APK `cu.uclv.descargar`, min SDK 24, target SDK 36. Se instaló el build debug de este repositorio.
- Arranque headless con SwiftShader (`-no-window`, sin cargar ni guardar snapshot). No se creó otro AVD.

## Casos ejecutados

| Caso | Resultado |
|---|---|
| Instalar APK y abrir `MainActivity` | Pasa. Android reconoce el paquete, la Activity queda en `RESUMED`, la WebView carga `/` y React presenta la biblioteca de ejemplo. No se observó `FATAL EXCEPTION` de la app en la revisión de logcat. |
| Consultar destino y espacio | Pasa. Android devolvió `Descargas/Descargar UCLV`, API 36, 5.632.917.504 bytes libres y 6.228.115.456 bytes totales. `df` del volumen emulado redondeó a 5,2 GiB libres de 5,8 GiB. |
| Conceder permiso de notificaciones | Pasa. El diálogo del sistema aparece antes de iniciar la cola; al permitirlo, la consulta y los controles nativos responden. |
| Encolar y pausar | Pasa. Un elemento sintético de QA se guardó en SQLite y pasó a `paused`; el control resolvió con el snapshot esperado. |
| Persistencia tras cierre forzado | Pasa. `am force-stop` y apertura posterior conservaron el elemento en estado pausado, con la misma ruta e ID. |
| Programar UIDT y notificar | Pasa tras corregir permisos. `dumpsys jobscheduler` mostró `userInitiatedApproved=true`, el `DownloadTransferJobService` activo y el constraint de conectividad. `dumpsys notification` mostró la notificación ongoing del paquete, canal `downloads`, ID 2401 y marca de user initiated. |
| Manejar red lenta/error | Pasa parcialmente. La conexión de la petición de prueba al origen agotó el timeout de 15 s; el estado quedó en `error` con `timeout`, sin reintento largo automático. |
| Reintento manual | Pasa. Al tocar “Reanudar”, se programó un segundo UIDT. El intento volvió a quedar en `timeout` tras aproximadamente 15,6 s. |
| Denegar notificaciones | Pasa. El diálogo del sistema aparece; al denegarlo, enqueue se rechaza con “Para descargar en segundo plano, permite las notificaciones…” y el snapshot queda con `jobs: []`. Después se restauró el permiso concedido. |
| Quitar cola | Pasa. `remove` dejó `jobs: []`; no quedó el trabajo activo ni su notificación. Se eliminaron los elementos de QA. |

## Incidencia encontrada y corrección

La primera reanudación falló porque JobScheduler exige `android.permission.ACCESS_NETWORK_STATE` para un trabajo con constraint de conectividad. Logcat confirmó `SecurityException` desde `JobScheduler.schedule`. Se añadió el permiso al manifest, se recompiló/reinstaló y se repitió la reanudación. El UIDT se programó y ejecutó correctamente después de la corrección.

## Límites de esta sesión

- El AVD tiene Wi-Fi virtual validado, pero la petición HTTPS a `visuales.uclv.cu` expiró. No se recibió una respuesta completa del servidor.
- No se descargaron bytes útiles, así que no se verificaron Range/If-Range contra una transferencia real, escritura del parcial, publicación final en MediaStore, apertura en el gestor de archivos ni checksum.
- No se simularon ENOSPC, reinicio del sistema durante la descarga, Android 10–15, políticas de fabricante ni dispositivo físico.
- El emulador estaba en modo `-no-window`; `screencap` produjo una pantalla negra. Se verificó el texto/estado de la WebView por DevTools remoto, pero esto no sustituye una revisión visual.

## Estado final del AVD

La cola de prueba quedó vacía, el permiso de notificaciones volvió a concedido y el APK permanece instalado. Maze Odyssey no se desinstaló ni se borraron sus datos.
