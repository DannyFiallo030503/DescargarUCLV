# Decisiones de arquitectura

Registro cronológico. Cambiar una decisión cuando haya nueva evidencia y dejar el motivo.

## D-001 — revisar diseño antes de construir UI funcional

- **Estado:** provisional, solicitado explícitamente por el usuario.
- **Decisión:** crear vista previa estática responsive para revisión, luego implementar UI.
- **Motivo:** la usabilidad y el aspecto son requisitos principales.

## D-002 — PWA como experiencia web, no garantía de descargas duraderas

- **Estado:** aceptada como límite de plataforma; empaquetado final abierto.
- **Decisión:** la PWA es una entrega; las descargas de larga duración usarán capacidades nativas donde existan.
- **Motivo:** el navegador puede suspender service workers; Background Sync tiene soporte y duración limitados.
- **Fuentes:** MDN Background Sync y operación en segundo plano (ver `docs/CONTEXT.md`).

## D-003 — estrategia de runtime multiplataforma

- **Estado:** aceptada para frontend y APK scaffold; worker de transferencias y desktop empaquetado siguen abiertos.
- **Recomendación:** React + TypeScript + Vite para una SPA estática rápida; IndexedDB para índice/listas/checkpoints en web; PWA para interfaz instalable y uso offline; Capacitor para APK Android; Tauri v2 como ruta de escritorio opcional. Mantener estados/políticas de catálogo y cola independientes de la UI y usar adaptadores por plataforma.
- **Por qué:** Vite ofrece plantilla React+TS y salida estática. Capacitor soporta web y Android con complementos nativos. Tauri es compatible con frontends Vite y provee camino a lógica nativa de escritorio. El frontend compartido reduce duplicación.
- **Riesgo:** Capacitor no convierte por sí solo una PWA en un gestor de descargas en segundo plano. Para transferencias largas y reanudables en Android hará falta evaluar un plugin o servicio nativo con almacenamiento a archivo, progreso y reintentos durables. No elegir una biblioteca específica hasta probar Range y almacenamiento incremental.
- **Fuentes:** [Vite](https://vite.dev/guide/), [Capacitor](https://capacitorjs.com/docs), [Tauri frontend](https://v2.tauri.app/start/frontend/), [Tauri](https://v2.tauri.app/start/).
- **Abierto:** almacenamiento local web concreto; motor de descargas Android; estrategia de filesystem/SAF; si los costos de mantenimiento del APK + escritorio justifican mantener ambos.

## D-008 — backup JSON local

- **Estado:** aceptada e implementada parcialmente.
- **Decisión:** copia versionada JSON de catálogo local, favoritos, listas/snapshots y estado/checkpoint de sincronización. Importar debe validar el documento completo, mostrar conteos antes de cambiar datos y reemplazar los stores en una transacción. Descargas, parciales, destino y credenciales quedan fuera; se administran en el runtime local.
- **Motivo:** evita perder colecciones sin empaquetar archivos grandes ni mover permisos/rutas del SO entre dispositivos.
- **Validación:** 4 pruebas de formato/relaciones y restauración IndexedDB. Falta cuota, fallo inyectado y UI de Chrome.

## D-009 — scaffold de Android

- **Estado:** shell generado; capacidad funcional y APK aún no cerrados.
- **Decisión:** usar Capacitor 8.6.0 con `cu.uclv.descargar`, `compileSdk/targetSdk 36`, solo permiso INTERNET, cleartext desactivado y backup automático Android desactivado. El frontend embebido no registra el service worker PWA; eso evita mezclar el ciclo del shell con bridges nativos.
- **Background:** no usar `@capacitor/background-runner` para una cola larga: es episódico y su documentación describe un máximo por ejecución. Evaluar un plugin Android con WorkManager long-running/user-initiated transfer y notificación foreground; mantener la cola/persistencia en un store compartido/reconciliable. Android advierte que workers foreground prolongados pueden consumir cuota de JobScheduler a partir de Android 16.
- **Evidencia actualizada (2026-11-03):** Android SDK 36, build-tools 35/36, platform-tools y JDK 21 quedaron instalados; licencias aceptadas con autorización del usuario. `npm run android:build:debug` produce un APK debug firmado de 4,1 MiB. No hay dispositivo/emulador conectado y el APK sigue siendo solo la shell Capacitor: no dispone del adaptador para catálogo/descargas que hoy resuelve el gateway Node. La compilación se rige por [requisitos actuales de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup), el target 36 documentado para 8.x ([matriz SDK](https://capacitorjs.com/docs/next/android/setting-target-sdk)) y las opciones de transferencias largas de [Android WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running).
- **Desktop:** Chrome/Edge pueden instalar el PWA como aplicación de escritorio; Tauri no se scaffolded porque Rust/WebKitGTK no están en el entorno y la necesidad de un segundo runtime no está justificada por el prototipo.

## D-010 — uso de CPU/RAM y búsqueda local escalable

- **Estado:** implementada en web; perfilado en Android físico y memoria real de Worker pendientes.
- **Decisión:** búsqueda directa local con índice normalizado y fuzzy diferido. En catálogos desde 5.000 elementos, el motor fuzzy vive en un Web Worker para mantener libre el hilo de interfaz; catálogos menores y navegadores sin Worker usan la ruta local síncrona. El cliente envía proyecciones mínimas `{id,name,relativePath}` una vez, aplica cambios confirmados incrementalmente y limita consultas pendientes a la más reciente. No aumentar paralelismo de rastreo/descargas en una conexión variable por defecto.
- **Medición de estrés (03-11-2026, Node 24.15.0):** corpus sintético determinista; 30k documentos: primera búsqueda+preparación 277 ms, consultas p50 2,61 ms/p95 5,94 ms, fuzzy inicial 399 ms, delta de heap 78,4 MiB. 100k: 856 ms, p50 9,46 ms/p95 10,48 ms, fuzzy 1.316 ms y delta 128,9 MiB. Son cifras del motor en Node, no del Worker ni del tiempo extremo a extremo del navegador; heap delta depende del GC y no equivale al RSS.
- **Evidencia navegador:** en Chrome con el índice local, `Fairy taill` mostró sugerencia `FairyTail` y 40 resultados offline; el campo siguió respondiendo mientras se procesaba otra consulta. La pestaña principal había perdido la corrida tras una operación abortada; se reinició desde el checkpoint y avanzó a 4.315 carpetas/61.999 archivos con botón “Pausar”.
- **Memoria:** Worker libera trabajo de cálculo del hilo visual, no elimina el coste de indexación. `postMessage` usa structured clone para esta proyección, por lo que hay una copia en memoria del Worker además de las estructuras del motor. Este entorno no dio una medición fiable del heap del Worker ni se probó en móvil Android de poca RAM; medir esos targets antes de reducir el umbral o prometer límites.
- **Evidencia:** `npm run test:stress`, pruebas unitarias/incrementales del cliente y motor, Chrome manual. Ver `docs/VERIFICATION.md`.

## D-004 — datos del catálogo y transferencias

- **Estado:** propuesta.
- **Decisión:** guardar metadatos de catálogo, listas y checkpoints de forma durable local; almacenar descargas parciales separadas de la base y renombrarlas atómicamente al terminar.
- **Condición:** confirmar API de archivos y límites de almacenamiento por plataforma.

## D-005 — búsqueda, selección jerárquica y destino

- **Estado:** requisito aceptado; diseño técnico pendiente de prototipo.
- **Decisión:** buscar sobre el índice local con tolerancia a errores y sugerencia de corrección. Mostrar ruta completa. Una serie agrupada puede incluir varias carpetas/temporadas; permitir seleccionar todo, algunas subcarpetas o archivos individuales e informar el alcance antes de añadir la rama a una lista.
- **Búsqueda:** normalizar mayúsculas, acentos, signos y espacios; combinar coincidencia exacta/prefijo con distancia de edición y tokens para clasificar resultados. Mostrar “¿Quizás quisiste decir...?” cuando haya una alternativa con confianza suficiente y mantener disponible la búsqueda exacta original. Elegir librería/índice tras medir con un fixture sintético de 30k documentos buscables; el snapshot local conocido contiene unas 30k carpetas y el conteo total de archivos está pendiente.
- **Destino:** `Downloads/Descargas` es la preferencia inicial en cada plataforma. La selección de ruta y consulta de espacio libre dependen del runtime; la cuota del navegador no equivale al espacio libre del volumen. En Android usar `MediaStore.Downloads` para las entradas de la app; mostrar “espacio no disponible” cuando no haya una medición fiable.
- **Fuentes:** MDN `showDirectoryPicker`, Android MediaStore y Storage Access Framework (ver `docs/CONTEXT.md`).


## D-006 — el árbol guardado no es índice de archivos

- **Estado:** aceptada según auditoría local del 2026-11-02.
- **Evidencia:** el snapshot HTML `Directory Tree` contenía alrededor de 30 mil enlaces únicos y todos apuntaban a directorios; no constituía un índice de archivos.
- **Decisión:** no usar esa cifra como cantidad de archivos. El rastreador general debe listar los archivos de cada directorio y guardar archivos separados de carpetas; conservar el snapshot histórico solo como navegación parcial/fixture.
- **Consecuencia:** el contador de los mockups era inexacto; se corrigió y la app no presenta conteos de carpetas como archivos.

## D-007 — supuestos iniciales del adaptador de origen

- **Estado:** evidencia preliminar; decisión de despliegue pendiente.
- **Evidencia:** sondeo de bajo volumen documentado en `docs/SOURCE_AUDIT.md`: Apache autoindex con HTML de tabla; carpetas listables con GET 200; MP4 con HEAD 200 y Range 206, Content-Range, ETag, Last-Modified y MIME; rango inválido 416; rutas codificadas aceptadas. El listing de directorio ignoró Range. No apareció `Access-Control-Allow-Origin` para `Origin: https://localhost`.
- **Decisiones de diseño inmediatas:** parser acepta solo `https`, host allowlisted y prefijo autorizado; no confiar en Range para listados; paginar/checkpoint por carpeta; transferencias parciales usan `If-Range` y no anexan si cambió el validador. Mantener concurrencia baja y configurable hasta medir bajo red variable.
- **Alternativas abiertas:** navegador directo cross-origin; cliente nativo con HTTP/filesystem propios; servicio local; backend/proxy. No seleccionar backend/proxy sin comprobar CORS desde el navegador real y revisar privacidad, operación y superficie de seguridad.
- **Consecuencia:** `CatalogAdapter` y `TransferAdapter` deben separar parseo/listado de transporte; fallos de CORS o validador se reportan como capacidad no soportada y no se simulan como éxito.
- **Pendiente:** prueba de CORS en Chrome desde origen candidato, If-Range, media, ruta fuera de Fairy Tail y medición de latencia bajo condiciones de red variable.

## D-008 — transporte web mediante gateway local

- **Estado:** decisión de implementación para el primer cliente web; revisar si el origen habilita CORS.
- **Decisión:** la PWA habla con un servicio local de loopback que sirve la aplicación, consulta listados y transmite archivos de `visuales.uclv.cu` bajo allowlist. El APK usará adaptador HTTP nativo y almacenamiento del sistema. El servicio web no aceptará conexiones LAN ni URLs arbitrarias.
- **Motivo:** las respuestas de prueba no incluyeron `Access-Control-Allow-Origin`, así que `fetch()` cross-origin no es una base fiable. `no-cors` oculta el cuerpo y no sirve para listar ni reanudar.
- **Consecuencia:** en escritorio web, la PWA requiere que el servicio local esté activo; una cola persistente puede retomarse al volver a abrirla. La web pura no se anuncia como instalable desde un host público hasta decidir un proxy HTTPS administrado.
- **Implementado parcialmente:** gateway escucha en `127.0.0.1`; las mutaciones requieren `Origin` localhost/127.0.0.1, JSON y `X-UCLV-Request`, sin CORS habilitado. Los recursos remotos solo se solicitan desde HTTPS con redirects restringidos al mismo origen.
- **Pendiente:** threat-model de localhost/DNS rebinding, confirmar política CORS desde host candidato de producción, evaluar instalación PWA de build y desarrollar transporte nativo Android.

## D-009 — preview multimedia same-origin

- **Estado:** prototipo implementado; una muestra MP4 reprodujo metadatos en Chrome a través del gateway.
- **Decisión:** abrir imágenes en `<img>` y video en `<video controls preload="metadata">` desde `/api/file`, servido por el gateway allowlisted. La carga comienza solo cuando la persona activa vista previa; el endpoint pasa Range y validadores al origen. Mostrar ruta y enlace al original.
- **Motivo:** el proxy ya mantiene la respuesta en streaming y el navegador puede decodificar los formatos que soporte sin descargar todo a memoria.
- **Límites:** la prueba de una muestra reportó 864×480 y 1464.96 segundos; no se verificó playback completo/checksum, imagen real, MIME alternativos, transferencia efectiva/Range, miniaturas automáticas, caché LRU ni estado de error enriquecido.
- **Seguridad base:** las mutaciones del gateway exigen `Origin` de loopback, JSON y `X-UCLV-Request`; revisar el threat-model local completo antes de release.

## D-010 — primer motor durable en gateway local

- **Estado:** prototipo local implementado; `G8` abierto.
- **Decisión:** Node administra una cola secuencial, estado JSON versionado/atómico en el perfil local y temporales `.part` en la carpeta destino. Al arrancar convierte un job interrumpido en cola; reanuda con `Range` y `If-Range` si hay ETag o Last-Modified, reinicia de cero si el servidor responde 200 a Range, comprueba Content-Range/tamaño, promueve con hard link para no sobreescribir y ofrece pausa/reanuda/quitar.
- **Retry/red:** timeout de inactividad 15 s; máximo dos reintentos con demora aleatoria acotada (~125–375 ms); 403/404 y errores de protocolo no se reintentan automáticamente; 5xx/red recuperable sí, y después se habilita reintento manual.
- **Destino/espacio:** por defecto `~/Downloads/Descargar UCLV`; permite especificar ruta absoluta, valida escritura con archivo temporal y mide `statfs` antes de aceptar y de cada archivo. Cada job conserva el destino fijado al encolarlo.
- **Evidencia:** fixtures HTTP locales cubren parcial Range/If-Range con SHA-256, pausa activa/reanudar, recuperación tras reinicio, retry 503, 404 permanente, cambio ETag, 416, destino persistente, traversal, dedupe y colisión. El API y la UI muestran el espacio del destino fijado a cada trabajo. Una unidad exFAT de prueba rechazó `link()`; el motor ahora usa `rename()` atómico y recupera un `.part` ya completo sin solicitar un rango vacío. No se publica el nombre ni la ruta de archivos de prueba del usuario.
- **Seguridad/revisión pendiente:** se revisan symlinks directos en carpetas hijas/`.part`, pero hay posible TOCTOU; revisar atomicidad/dir fsync en todos los SO, ENOSPC, redirects cross-host automatizados, threat-model loopback, Android Background/MediaStore y desktop empaquetado. Sin hash remoto anunciado, tamaño + rango son las verificaciones disponibles.

## D-011 — timeout del listado no repite una petición larga

- **Estado:** implementada y comprobada en gateway web.
- **Evidencia:** un listado real del origen superó el límite local de 15 s. El gateway devolvía HTTP 400 y texto genérico `This operation was aborted`; el sincronizador repetía la operación aunque el fallo era timeout.
- **Decisión:** mantener el límite de inactividad de 15 s e informar HTTP 504 en español. El sincronizador aparca solo esa carpeta y continúa el resto; al agotar la cola muestra índice parcial y número de carpetas lentas. Una orden manual reintenta las aparcadas. No repite automáticamente una espera larga; mantiene el retry breve para fallos transitorios 5xx como 503. Errores permanentes distintos del 504 siguen deteniendo y mostrando el error.
- **Verificación:** llamada de solo lectura a `/api/list?path=/` respondió HTTP 504 a los 15,006 s; Chrome mostró el mensaje tras una sola espera. La prueba del sincronizador simula timeout, comprueba que otras ramas se completan y que el reintento manual recupera la rama. Pruebas del adapter diferencian 504 diferible, 404 permanente y 503 transitorio. Una corrida real en Chrome pasó de 4.350/62.343 a 4.640/65.361; el crawl aún continúa y no se conoce su total.

## D-012 — acceso nativo Android al índice

- **Estado:** adaptador de catálogo implementado; validación de red en dispositivo queda pendiente.
- **Decisión:** el APK accede directamente por HTTPS a `visuales.uclv.cu` mediante `CapacitorHttp`, sin depender del gateway Node ni habilitar cleartext. El adaptador comparte el parser Apache probado en fixtures, construye URLs desde rutas decodificadas y fija el origen a una allowlist exacta. Desactiva redirecciones automáticas y sigue hasta tres redirecciones solo dentro del mismo origen. Conexión/lectura tienen timeout de 15 s; 504 aparca una carpeta, 5xx transitorio recibe el retry breve ya definido por el sincronizador y errores permanentes se muestran.
- **Límite:** CapacitorHttp entrega el cuerpo al bridge como texto completo; el límite de 16 MiB evita parsear listados enormes, pero no evita que el cuerpo completo haya pasado antes por memoria nativa/JS. No se promete descarga nativa, background, reanudación de archivos, elección de carpeta ni espacio libre en Android. La UI mantiene esos controles bloqueados hasta implementar un motor nativo durable.
- **Verificación:** tests con transporte inyectado y HTML fixture cubren parseo/ruta, timeout configurado, status, cancelación y redirects; pruebas unitarias y build Android. Falta probar una sincronización real desde APK en dispositivo/red UCLV, límite de memoria con listado grande y flujo de error offline.

## D-013 — ejecución Android de transferencias largas

- **Estado:** implementación integrada y prueba runtime parcial en MazeOdyssey36External (Android 16/API 36); archivo completo aún no validado.
- **Decisión/implementación:** cola y validadores/offsets en SQLite; parciales en almacenamiento nativo privado, fuera de IndexedDB y del bridge. Android 14+ programa `JobScheduler` user-initiated data transfer job al aceptar/reanudar una cola; Android 10–13 usa servicio foreground. Ambos muestran notificación. Una transferencia activa, checkpoints sincronizados cada MiB, pausado/reanudar y recuperación de estados al abrir. Errores HTTP permanentes quedan por archivo y pueden reintentarse manualmente; un 5xx recuperable tiene un único retry breve y no hay backoff largo.
- **Destino:** Android 10+ publica archivos completos en `MediaStore.Downloads` bajo `Download/Descargar UCLV`; mantiene `IS_PENDING` durante la copia y no expone el archivo parcial. Android 7–9 se rechaza explícitamente hasta definir SAF/permiso legacy.
- **Integridad/red:** HTTPS allowlist `visuales.uclv.cu`, hasta tres redirects al mismo host, timeouts de conexión/lectura de 15 s, Range + If-Range ETag/Last-Modified y validación de `Content-Range`; si el servidor ignora el rango, el parcial se trunca antes de escribir desde cero. Revisa tamaño y reserva de espacio antes de aceptar y durante la transferencia.
- **Verificación:** protocolo Range/validador y validación de ruta/ID pasan pruebas JVM; 72 pruebas web y `testDebugUnitTest`/`assembleDebug` pasan. En el AVD Android 16 se concedió/denegó el permiso de notificaciones; denegar deja la cola vacía y da un mensaje claro. La cola pausada sobrevivió `force-stop` y reapertura. La primera reanudación reveló `ACCESS_NETWORK_STATE` ausente; tras añadirlo, JobScheduler inició el UIDT con `userInitiatedApproved=true`, creó la notificación, ejecutó el worker y al expirar la conexión dejó `timeout` reintentable. Reintento manual ejecutó otro trabajo y `remove` limpió cola/notificación. La petición HTTPS al origen expiró a 15 s; no se validó transferencia completa ni escritura final MediaStore. El AVD estaba en modo headless, así que el contenido DOM se verificó pero la captura de pantalla salió negra y no cuenta como QA visual.
- **Base técnica:** [Android UIDT jobs](https://developer.android.com/develop/background-work/background-tasks/uidt) para transferencias largas iniciadas por la persona (API 34+) y [almacenamiento compartido](https://developer.android.com/training/data-storage/shared/media) para filas propias de MediaStore. Deben cerrarse las pruebas de target 36, batería, force-stop, reboot, errores de almacenamiento y políticas de fabricantes antes de release.

## D-014 — destino Android y medición de espacio

- **Estado:** destino predeterminado y escritura MediaStore implementados para Android 10+; selector de carpeta alternativo pendiente.
- **Decisión:** usar `Download/Descargar UCLV` dentro de `MediaStore.Downloads`. Un plugin Capacitor local devuelve la ruta visible y espacio/capacidad del volumen compartido por `StatFs`, sin permiso amplio de almacenamiento. Los archivos se crean como filas privadas `IS_PENDING` y se publican al terminar. Los parciales se guardan en almacenamiento privado de la app. Al encolar se estima el espacio de parcial + copia final + reserva de 64 MiB y se repite la comprobación durante la transferencia. Android 7–9 informa que no está soportado; no inventa cifras. La ruta se muestra, aún no es editable.
- **Verificación:** en API 36 el plugin reportó 5,63 GB disponibles de 6,23 GB; `df` de Android redondeó a 5,2 GB libres de 5,8 GB, consistente. Se probó el prompt de notificación y denegación. Pendiente volumen secundario/ENOSPC, comprobar desde el gestor de archivos la apertura de un archivo realmente publicado y contraste en dispositivo físico.

## D-015 — Vercel como vista previa estática de UCLV Media (supersedida)

- **Estado:** producción `READY` como instantánea estática; SSO del equipo habilitado; conexión automática de GitHub pendiente.
- **Decisión:** alojar el frontend Vite compilado en `dist/` bajo el proyecto `uclv-media` y alias `https://uclv-media.vercel.app/`. No migrar el gateway a funciones serverless ni exponer el origen: las colas/parciales necesitan almacenamiento local durable y las rutas `/api/*` no forman parte del build estático.
- **Verificación:** raíz, manifiesto, service worker, JavaScript, CSS y ambos iconos respondieron 200; `manifest.webmanifest` declara `UCLV Media`, `standalone` y `/`. `/api/health` responde 404, como se espera en un host solo estático.
- **Consecuencia:** el despliegue permite evaluar interfaz y shell PWA/offline; catálogo, previews a través del gateway y transferencias requieren el gateway local o APK. Vercel no recibe archivos personales. El repo GitHub no está enlazado al proveedor Git, por lo que el deploy actual es manual y los pushes no lo actualizan.

## D-016 — soportar los dos formatos del autoíndice Apache

- **Estado:** parser corregido; APK debug reconstruido y versión de producción actualizada. Smoke de red Android pendiente; conectividad Vercel sigue fallando.
- **Evidencia:** el `GET /` de `visuales.uclv.cu` del 2026-11-05 respondió 200 con un `<pre>` de 2.147 bytes, 14 carpetas y 5 archivos. El parser aceptaba solo tablas `<tr>/<td>`, por lo que ambos adaptadores, nativo y gateway/serverless, podían convertir una respuesta válida en un índice vacío.
- **Decisión:** `parseApacheIndex` acepta filas de tabla y enlaces en `<pre>`; interpreta el último token posterior al enlace como tamaño y `-` como directorio. Ambos transportes mantienen el mismo parser y las mismas reglas de host/ruta.
- **Verificación:** fixture de `<pre>`, fixture de tabla heredada y parseo del cuerpo real de la raíz (19 entradas). El APK debug compila; el AVD disponible no arranca por arquitectura ARM no soportada por QEMU2. Vercel devuelve `fetch failed` antes de entregar HTML al parser.
- **Consecuencia:** los listados se hacen visibles al sincronizar. El cambio no evita que el host Vercel bloquee o no alcance la red del origen; ese fallo de transporte permanece diferenciado del parser.

## D-017 — funciones Vercel y compatibilidad de red con el origen

- **Estado:** API de solo lectura desplegada en `gru1`; conectividad al origen no disponible desde esa región.
- **Evidencia:** `/api/health` devuelve `catalogAvailable:false`; `/api/list?path=/` devuelve HTTP 502 `fetch failed` y el encabezado de ejecución confirma `gru1`. Desde la estación de desarrollo, el mismo `GET /` devuelve HTTP 200 desde IP `181.225.254.2`. El servidor devuelve Apache `<pre>` y el parser ya procesa el formato.
- **Decisión:** conservar solo lectura y fallback de índice offline; no introducir un proxy de terceros ni confiar la cola a Vercel. El cambio de IAD1 a GRU1 no corrigió el egreso al host.
- **Consecuencia:** compilar/publicar el frontend ya no basta para sincronizar en Vercel. Hace falta alojar el adaptador en una red que sí alcance UCLV o usar el gateway local/APK en una red con acceso.

## D-018 — fallback del PWA desplegado al gateway del mismo equipo

- **Estado:** implementado; pruebas HTTP/CORS y build pasan. Revisión manual de Chrome con permiso de red local pendiente.
- **Evidencia:** Vercel en IAD1 y GRU1 devolvió `fetch failed`; Node del equipo pudo consultar las tres IPv4 del DNS del origen con HTTP 200. El servidor local escucha solo en loopback y puede actuar como puente desde una computadora con acceso.
- **Decisión:** cuando la persona pulsa sincronizar en Vercel y la función no alcanza el catálogo, la web prueba `http://127.0.0.1:4179`. Chrome solicita permiso de loopback desde el origen HTTPS; si el gateway responde, catálogo, previews, cola y destino usan ese mismo origen. El gateway permite CORS solo desde `https://uclv-media.vercel.app`, incluyendo el preflight estándar; otros sitios no reciben acceso CORS. Los cambios siguen requiriendo `X-UCLV-Request` y JSON.
- **Consecuencia:** para usar la web publicada en escritorio hay que ejecutar `npm run gateway` en el mismo equipo y aceptar el permiso local de Chrome si aparece. La PWA en un teléfono no puede acceder al loopback de otra computadora; allí se usa la APK o un gateway alojado en una red accesible. Vercel no recibe archivos del usuario.
