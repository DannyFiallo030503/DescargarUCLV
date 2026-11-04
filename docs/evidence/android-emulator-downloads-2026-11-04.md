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

## Revisión adicional de continuidad

- Se repitieron `npm test` (72/72) y `npm run build` (correctos; Vite advierte que el bundle principal minificado supera 500 kB).
- Se intentó repetir `testDebugUnitTest assembleDebug`. La primera ejecución descargó Gradle 8.14.3; las tareas `testDebugUnitTest` y `assembleDebug` llegaron a figurar `UP-TO-DATE`, pero Gradle continuó más de diez minutos en `:capacitor-android:extractDebugAnnotations`, consumiendo CPU. Se interrumpió esa tarea de metadatos. El APK existente sigue verificable y su SHA-256 es `dd6564a39974dce72a1536aee0459b7376777b154efaa4637057a9d8473506de`; esta repetición no se considera una ejecución Gradle completa.
- Se probó de nuevo la ruta al origen: un HEAD desde el host a `181.225.239.26:443` expiró tras 7 s sin cabeceras. El túnel loopback con `adb reverse` sí conectó el tráfico del AVD al host, pero el origen no respondió en el intento anterior. No se insiste para evitar sumar solicitudes mientras la conexión está degradada.
- Se retiraron los ajustes temporales: proxy global del AVD en `:0`, reverse de `18888` eliminado y proceso del proxy detenido. La app se dejó abierta en `MainActivity`; cola de QA vacía, permiso de notificaciones concedido y sin notificación de descarga activa.

## Revalidación posterior

- La repetición con `./android/gradlew -p android testDebugUnitTest assembleDebug --no-daemon --console=plain --info` terminó con `BUILD SUCCESSFUL` (102 tareas `UP-TO-DATE`, 6 min 53 s). El primer atasco quedó explicado por descargas de primera vez desde Google Maven y Maven Central; al terminar se guardaron en la caché. Persiste solo la advertencia de límite bajo de instancias inotify del entorno.
- `npm test`: 15 archivos, 72/72 pruebas correctas. `npm run test:stress`: 2/2 correctas; 30k documentos: búsqueda+índice 485 ms, p50 3,69 ms/p95 9,4 ms, fuzzy inicial 761 ms, heap delta 85,1 MiB; 100k: 1.547 ms, p50 14,18 ms/p95 15,72 ms, fuzzy inicial 2.326 ms, heap delta 123,7 MiB. Ejecución Node; no representa memoria móvil ni latencia del Worker en Chrome.
- Un HEAD desde el host al origen expiró de nuevo a los 12 s sin recibir bytes. La prueba de transferencia completa Android queda pendiente hasta tener conectividad estable desde el AVD.
- Se forzó la repetición de `testDebugUnitTest` con `--rerun-tasks`: `BUILD SUCCESSFUL` en 49 s, 53 tareas ejecutadas y `:app:testDebugUnitTest` ejecutada (no omitida como `UP-TO-DATE`). El APK se reinstaló y `MainActivity` quedó en primer plano. Se verificó de nuevo proxy `:0`, sin reverse ADB y sin notificación activa de descarga.
