# Plan de verificación y trazabilidad

## 1. Regla de cobertura

Ningún requisito, campo, transición ni integración se considera terminado sin: (a) regla/resultado definido, (b) validación positiva, (c) caso negativo o límite, (d) mensaje de error/estado, (e) evidencia reproducible. Cada PR/entrega enlaza IDs de `docs/REQUIREMENTS.md` y adjunta resultado de verificación.

## 2. Verificación por campo y control

| Pantalla / campo | Reglas y validación | Verificación funcional por campo |
|---|---|---|
| Búsqueda `query` | Texto Unicode; trim; límites razonables; consulta vacía no dispara búsqueda; sin interpretar HTML. | Probar vacío/espacios, acentos, typo, transposición, caracteres no latinos, consulta larga y entrada rápida; comprobar ranking, debounce, Enter, limpiar y búsqueda exacta. |
| Sugerencia “¿quisiste decir?” | Solo sobre threshold; muestra término original y sugerido; no corrige sin gesto. | Forzar buen/mal match, empate, sin candidato y aceptación/cancelación; preservar query raw. |
| Breadcrumb/nodo | ID de nodo válido; ubicación actual existe o está marcada obsoleta. | Abrir cada nivel, regresar padre/raíz, offline, nodo borrado del último índice y deep link inválido. |
| Checkbox de grupo | Estado checked/partial/unchecked calculado desde hijos; no pierde hijos ocultos por filtro. | Marcar padre, quitar un hijo, quitar todos, filtrar/ordenar con selección activa, añadir al job y verificar los IDs exactos seleccionados. |
| Checkbox de carpeta/temporada | Selecciona descendientes de la carpeta actual. | Carpeta vacía, subcarpetas anidadas, 1/1000 items, item ya completado, duplicado en otra lista. |
| Checkbox de archivo | Nodo descargable, no carpeta; tamaño/URL pueden faltar pero se comunican. | Archivo normal, sin tamaño, URL duplicada, nombre Unicode, HTML inseguro/invalid path. |
| Botón “Seleccionar todo” | Alcance explícito: página, carpeta actual o grupo completo; nunca ambigüedad. | Confirmar conteo y deselect; cambio filtro/página no altera alcance inadvertidamente. |
| Campo nombre de lista | Trim, 1..N caracteres configurado, no solo espacios, Unicode permitido; duplicados resueltos. | Vacío, whitespace, nombre repetido, emoji, muy largo, renombrar y cancelación; mensaje junto al campo. |
| Selector destino | Tipo/ruta permitidos, permiso vigente, plataforma y capacidad registradas. | Aceptar, cancelar, ruta solo lectura, expulsión de SD, handle revocado, seleccionar otra y restablecer Downloads. |
| Texto “ruta destino” | Escapado; truncado visual con valor completo accesible/copiar. | Ruta larga, caracteres de control/Unicode, rutas homónimas de unidades distintas. |
| Espacio disponible | Bytes enteros; unidad GiB consistente; fuente/hora; `unknown` si no es fiable. | Cero, desconocido, cambió tras medir, unidad removible, permiso y cuota web diferente al volumen. |
| Resumen de selección | Suma de conocidos; contador desconocidos; overhead temporal explicado. | Selección vacía, una rama, parcial, tamaños mixtos y deselección; cotejar con datos fixture. |
| Confirmación de descarga | No inicia si espacio insuficiente medible; opción de crear lista persiste. | Confirmar, cancelar, seleccionar otra ruta, crear lista para después y medir de nuevo antes de iniciar. |
| Concurrencia | Entero entre mínimo/máximo y límite global aprobado. | Cero, negativo, decimal, muy alto; cambiar con trabajos activos; validar máximo observado. |
| Timeout de inactividad | Duración positiva dentro de límites; unidad visible. | Límite inferior/superior, input malformado, timeout durante lectura sin bytes, servidor lento que sigue enviando. |
| Límite de reintentos | Entero acotado; distingue retries automáticos y manuales. | 0, 1, máximo, error permanente, error intermitente, reinicio de app; nunca superar deadline configurado. |
| Elemento de lista | Referencia a nodo durable, orden, estado y duplicado. | Añadir/quitar/reordenar, nodo ya inexistente, mismo archivo en dos listas y reabrir después de reinicio. |
| Favorito | Identidad de nodo estable; nombre snapshot cuando catálogo cambia. | Marcar/desmarcar desde varias pantallas y buscar offline, URL redirigida o nodo ausente. |
| Botón pausar/reanudar | Permitido según estado; persistir antes de actualizar UI final. | Durante resolve, descarga, retry-wait, verifying; doble toque; cerrar inmediatamente y reabrir. |
| Progreso | Bytes confirmados ≤ esperado; porcentaje no falso sin tamaño; ETA oculto si muestra inestable. | 0, parcial, tamaño desconocido, content-length cambia, progreso no monótono y reanudar. |
| Nombre/ruta de archivo | Sanitizar traversal (`..`), separadores y nombres reservados por OS; conservar nombre original en catálogo. | Unicode, slash, `..`, punto final, longitud límite, colisión case-insensitive y archivo ya existente. |
| Mensaje de error | Idioma común + qué pasó + si parcial sigue guardado + acción siguiente. | Timeout, 403,404, rango inválido, disco lleno, sin permiso, ETag cambiado, parser failure. |
| Importar backup | Versionado, esquema, límites de tamaño, validación completa antes de escribir. | Archivo corrupto, versión futura, campos desconocidos, duplicados, backup válido y rollback al fallo. |

## 3. Niveles de verificación

### Caja blanca, caja negra y automatización

- **Caja blanca / unidad:** reglas de dominio, selección y sumas, parser, agrupación, sincronizador, persistencia/migración/backup y estados del gestor de descargas.
- **Caja negra HTTP:** `server/gateway.blackbox.test.mjs` inicia un proceso aislado con estado y descargas temporales; valida salud/destino/capacidad del sistema de archivos, rechaza mutaciones sin Origin y traversal sin consultar `visuales.uclv.cu`.
- **Funcional/E2E:** Chrome local cubre manualmente navegación, typo, selección, favoritos/listas, cola/preview, destino, offline y responsive. Android virtual cubre UI/estado local. El adaptador nativo de índice ya está implementado, pero falta ejecutarlo en un Android con red; transferencias reales esperan el motor nativo durable.
- **Estrés/performance:** `npm run test:stress` crea catálogos sintéticos deterministas de 30k/100k y valida búsqueda exacta y typo; no carga el origen real. Mide el motor síncrono en Node, no memoria ni latencia extremo a extremo del Worker.
- **Red/transferencias:** respuestas HTTP fixture cubren 404/503, rangos/ETag, pausa/reanudación y recuperación. No se lanza estrés contra el sitio UCLV.

### Dominio/unitario

Fixtures deterministas para normalización, ranking, grupos/temporadas, selección parcial, cálculo bytes, máquina de estados, retry policy, merge/import y filenames. Casos de límites y generativos para paths/Unicode; invariantes en cada transición.

### Integración local

- Repositories IndexedDB: CRUD, transacción, migración anterior→actual, cierre abrupto en commit y reconstrucción del índice.
- Parser Apache: HTML `<pre>`, tabla, espacios/entidades, URL encoded, padre, query links, tamaño faltante, host ajeno, redirect y profundidad límite.
- Transfer adapter con servidor fixture local: 200, 206, Content-Range correcto/incorrecto, ETag igual/cambiado, lectura cortada, 404, 5xx, cero bytes y disco lleno simulado.
- Filesystem adapters: temporal, atomic rename, colisión, permiso revocado, destino externo retirado.

### E2E/UI

Browser Chrome autorizado para PWA: completar FL-01 a FL-10 contra datos fixture; capturar tamaños 360×800, 390×844, tablet 768px y escritorio 1440px. Verificar refresh/offline y axe/teclado/lector manual. Android emulador + dispositivo real para MediaStore, foreground/background, reinicio y almacenamiento. Desktop por SO objetivo para ruta, free-space y cierre inesperado.

### Resiliencia/red

Perfil de laboratorio con DNS lento/caído, latencia variable, pérdida, desconexión después de offset conocido, TLS/error server y throughput variable. No usar descargas masivas del origen real. Cada ejecución compara bytes del archivo final con fixture checksum y recuperabilidad del job.

### Rendimiento

Semilla reproducible: corpus sintético de 30,000 documentos buscables (ampliar a 100,000), más jerarquía de directorios; el total local de ficheros se desconoce hasta enumerar el origen. Medir consultas exactas/fuzzy, arranque frío/caliente, memoria, indexación y scrolling virtualizado. Registrar hardware/navegador, p50/p95/p99, tamaño DB y memoria.

## 4. Matriz de cobertura requisito → evidencia

| Requisitos | Evidencia mínima |
|---|---|
| REQ-CAT-01..03 | Fixtures de parser + sync interrumpido/reanudado + video de navegar offline con fecha visible. |
| REQ-SRC-01..03 | Casos de ranking oro con query escrita, candidatos esperados, orden, sugerencia y ruta; benchmark de 30k documentos sintéticos. |
| REQ-SEL-01..03 | Tabla de selección árbol antes/después + snapshot de preview de plan con contadores y bytes. |
| REQ-LST-01, REQ-FAV-01 | E2E persistencia tras reinicio y export/import, sin duplicados. |
| REQ-DL-01..04 | Pruebas de transición/Range/ETag + job retomado + archivo checksum idéntico. |
| REQ-DST-01..04 | Matriz web/Android/Desktop, default/cambio/permiso/espacio corto/cambio de volumen. |
| REQ-MED-01, REQ-IMG-01 | MIME de prueba, carga diferida/cancelación, caché acotada y fallback de abrir original. |
| REQ-SET-01, REQ-DAT-01 | Validación por input, persistencia, migración, import preview y rollback. |
| REQ-APP-01..03 | Instalar/abrir/offline por plataforma; demostrar capacidades reales, no solo build exitoso. |
| RNF-* | Informe de accesibilidad, rendimiento, recuperación, privacidad y prueba de tareas UX. |

## 5. Revisión por cambio y gates

Cada fase requiere revisión de: requisitos afectados, contrato API/dominio, estados vacíos/error, permisos, móvil/escritorio, teclado/lector, datos migrados, telemetría/logs, riesgo de red, evidencia y rollback. No avanzar si falta uno de los campos afectados o hay error crítico/high sin responsable y mitigación.

- **S0 Diseño aprobado:** inventario de pantallas, prototipos responsive y flujos; revisión de UX antes de UI funcional.
- **S1 Origen entendido:** origen/parsing, CORS, Range, validadores y ritmo conocidos; decisiones archivadas.
- **S2 Dominio/persistencia:** modelo revisado, migración/exportación y búsqueda local probada con fixtures.
- **S3 Descargador:** recuperación/checksum y estados de error aprobados antes de lotes.
- **S4 Interfaces:** matriz campo/control al 100%, a11y y E2E principales.
- **S5 Plataformas:** APK/PWA/desktop validados en targets declarados, permisos y destino probados.
- **S6 Release:** cero defectos P0/P1 abiertos, backup/restauración probados, checklist de actualización y guía operativa.

### Responsables de revisión

| Revisión | Responsable | Debe aprobar |
|---|---|---|
| Producto/requisitos | Usuario (owner) | Alcance, prioridad, lenguaje, estados y flujos completos. |
| UX/accesibilidad | Revisión del prototipo + inspección humana | Cada viewport, foco, lector, comprensión de errores y tareas. |
| Arquitectura | Revisión técnica | Límites de capas, clase/contrato, datos/migración, seguridad del parser y adaptador. |
| QA | Revisión de evidencia | Campo/requisito, reproducción, defecto/regresión, plataforma y resultado real. |
| Release/plataforma | Owner del target | Permisos, almacenamiento, build, instalación/actualización y rollback de datos. |

Dejar registro por fase con: `gate`, artefacto/version, revisores, observaciones, defectos abiertos/aceptados, evidencia y decisión `approved`/`rework`. Si una etapa no pasa, corregir y re-revisar antes de iniciar su dependiente.

## 6. Registro de defectos

Campos obligatorios: `id`, requisito, dispositivo/OS/browser, build, pasos exactos, esperado, actual, severidad, frecuencia, evidencia, si hay pérdida/corrupción, workaround, causa y prueba de regresión. P0 = pérdida/corrupción general; P1 = flujo esencial inutilizable o datos en riesgo; P2 = función degradada con workaround; P3 = pulido.

## 7. Evidencia de implementación actual (02-11-2026; actualización 03-11-2026)

- `npm run build`: correcto (TypeScript + bundle de producción PWA); incluye chunk Worker `catalog-search.worker` de 28,45 kB sin comprimir.
- `npm test`: incluye protocolo del cliente Worker y política del sincronizador: fallback de catálogo pequeño, una búsqueda activa + última en cola, fallback tras error del Worker, mapeo tras actualización, timeout aplazado/no reintentable y 503 reintentable.
- `npm run test:stress` (última corrida 03-11-2026): pasó en corpus sintético. Motor Node, 30 consultas: 30k documentos p50 2,53 ms/p95 5,85 ms/primera búsqueda+preparación 411 ms; 100k p50 11,27 ms/p95 14,46 ms/primera búsqueda+preparación 1.286 ms. Primera búsqueda fuzzy (con construcción de Fuse): 457 ms/1.688 ms. Heap delta 86,9/121,9 MiB, sensible al GC. Los valores varían entre ejecuciones y no miden Worker en navegador ni su memoria; la copia vía structured clone y memoria del índice deben medirse en Android y escritorio.
- `npm test` (04-11-2026): **72 pruebas pasan**. El adaptador nativo usa request fake y fixtures, sin pedir listados reales: comprueba parseo, codificación de rutas, allowlist/redirect, timeouts, status HTTP, cancelación y 504 diferible. `npm run test:stress`: pasó de nuevo; 30k: p95 7,30 ms, primera búsqueda+índice 393 ms; 100k: p95 11,57 ms, primera búsqueda+índice 1.221 ms. Heap observado 86,5/123,6 MiB; son datos Node sintéticos, no consumo Android.
- `npm test`: **63/63 pruebas, 13/13 archivos**. Incluye timeout → continuar otras carpetas → reintento manual; carpetas aplazadas en backup; y persistencia tras cerrar/reabrir IndexedDB con el catálogo confirmado y el punto pendiente de sync intactos. El módulo de almacenamiento prueba solicitud concedida/denegada, cuota estimada y APIs no disponibles.
- `npm run build`: TypeScript y bundle PWA completados correctamente tras añadir la protección del índice.
- `npm run android:build:debug`: sincronización de assets y compilación Gradle debug completadas correctamente; warnings de `flatDir` heredados no bloquean el build. Build repetido tras los cambios de persistencia: correcto.
- Motor fuzzy fuera del hilo UI mediante Web Worker desde 5.000 nodos; catálogos pequeños o navegadores sin Worker usan fallback síncrono. El Worker recibe proyección delgada una vez, cambios incrementales de carpetas confirmadas y a lo sumo una consulta pendiente (la más reciente sustituye a las anteriores).
- `npm audit --omit=optional`: cero vulnerabilidades conocidas en el árbol instalado al momento de la revisión.
- Descargas en fixtures HTTP locales: retomar `.part` con `Range/If-Range`, pausa durante stream y reanudación al offset exacto, validar SHA-256, recuperar estado tras reinicio, reconciliar final ya promovido, elegir/restaurar destino, deduplicar rutas, traversal, no sobrescritura, 404 sin retry y continuar items posteriores, retry acotado en 503, cambio de ETag (200 reinicia desde cero) y 416 conserva parcial sin retry.
- Chrome local: listas crear/renombrar/añadir/quitar/duplicar/reordenar/eliminar; favoritos persisten; destino cambiado a temporal y restaurado; API GET muestra `statfs`; origin remoto rechazado; preview MP4 carga metadatos; revisión previa muestra 70 MiB, destino y espacio, y se canceló sin iniciar trabajo. Se inspeccionaron 360×800, 390×844, 768×1024 y 1440×900.
- Backup/restore local: previsualización de conteos, rechazo de JSON inválido/versión futura/traversal/duplicados/padres ausentes, reemplazo atómico y reanudación de sync como pausada están cubiertos por 4 pruebas Vitest. Pendiente flujo visual completo de exportar→importar en Chrome y restauración con cuota agotada.
- Persistencia local: Chrome conserva el catálogo, listas y checkpoint en IndexedDB; abrir la app lee ese estado y no solicita `/api/list` hasta que se pulsa sincronizar/continuar. Se añadió `navigator.storage.persist()` a la acción explícita de sincronización y a Ajustes, mostrando concesión/denegación y estimación de uso/cuota. Prueba con el catálogo real: después de cerrar la pestaña, una nueva la reabrió mostrando 5.362 carpetas guardadas y en pausa; al pulsar “Continuar” avanzó a 5.364/73.837 desde el checkpoint. Chrome concedió el almacenamiento persistente. Ajustes reportó 27,7 MiB usados de 10 GiB y 80.743 elementos guardados. El navegador puede negar protección; borrar los datos del sitio sigue eliminándolos, así que el backup exportado es la copia independiente. No se ha completado un ciclo de apagar/encender el sistema operativo con el volumen del navegador, ni se probó cuota real agotada.
- Accesibilidad manual en Chrome: 0 botones/campos visibles sin nombre accesible, texto visible >=12 px, foco inicial en nombre de lista, Tab/Shift+Tab queda dentro del diálogo, Escape cierra y restaura foco al botón que abrió el diálogo. Falta contraste programático/lector de pantalla y recorrido completo de teclado.
- Capacitor Android 8.6: proyecto nativo y assets sincronizados; permisos incluyen INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, FOREGROUND_SERVICE/DATA_SYNC y RUN_USER_INITIATED_JOBS; backup y tráfico cleartext desactivados. SDK 36, build-tools 35/36, platform-tools, JDK 21 y Gradle Wrapper están instalados. `testDebugUnitTest` y `assembleDebug` pasaron con `--no-daemon --max-workers=2`. APK debug 4,2 MiB, id `cu.uclv.descargar`, min SDK 24/target SDK 36; SHA-256 `dd6564a39974dce72a1536aee0459b7376777b154efaa4637057a9d8473506de`; firma v2. No hay teléfono físico conectado.
- **Prueba Android virtual, 03-11-2026:** se instaló y abrió el APK debug sin crash en un Android x86_64 virtual de 720×1616. Se probaron búsqueda con errores de escritura, sugerencia, selección/navegación de serie, Favoritos y listas sobre datos de ejemplo. El plan de descarga bloqueó la cola cuando el destino no estaba disponible y el espacio era cero. No se inició una transferencia. Logcat no presentó `FATAL EXCEPTION` atribuible a la app. Captura: [android-queue-review.jpg](evidence/android-queue-review.jpg).
- **Prueba APK actualizada, Ramus, 03-11-2026:** se subió el APK de 4,2 MiB a la prueba anónima x86_64 Android 17 (720×1616), se instaló y abrió. `Fairy Tial` propuso `Fairy Tail` y mostró 5 resultados del fixture offline; aplicar la sugerencia mostró 7 resultados y un grupo con 5 carpetas relacionadas. Seleccionar el grupo cambió el botón a “Quitar selección”; abrir la carpeta actualizó la ruta a `Infantiles/Animes/Fairy Tail`. Añadir `01.mp4` a Favoritos hizo que apareciera allí con acción “Quitar 01.mp4 de favoritos”. Logcat filtrado por `FATAL EXCEPTION` devolvió cero líneas. El estado muestra “Servicio local sin conexión” (esperado: el APK aún no tiene adaptador Android al gateway); no se encoló ni descargó ningún archivo. El fixture contiene menos de 5.000 nodos, por lo que esta prueba del APK verifica el fallback síncrono y no activa el Web Worker. La prueba anónima bloquea túneles ADB, por lo que no se pudo medir memoria con `dumpsys`; la sesión se cerró al terminar.
- **Historial emulador local:** la descarga inicial de la imagen Android 36 falló por ZIP incompleto. Después se localizó el AVD `MazeOdyssey36External`, con sus datos ext4 en el disco externo, ya existente y reconocible por el SDK en `/var/tmp/maze-android-sdk`; se reutilizó sin crear otro AVD.
- Chrome, 03-11-2026: el snapshot anterior contenía 4.270 carpetas y 61.455 archivos. En pestaña aislada con el build Worker, `Fairy taill` mostró `FairyTail`, seis carpetas relacionadas y 40 resultados offline; una ráfaga `Fairy taill` → `Fairy tail` → `Fairy tial` terminó con resultados coherentes con la consulta final. El sync alcanzó 4.315 carpetas/61.999 archivos y luego se detuvo en el límite de espera de la fuente.
- **Timeout de sincronización, 03-11-2026:** el GET local a `/api/list?path=/` reprodujo timeout a los 15,002 s. Antes de la corrección respondía HTTP 400 con `This operation was aborted`. El gateway actualizado responde HTTP 504 con mensaje en español y el checkpoint; en Chrome, la interfaz mostró ese mensaje tras una sola espera de 15 s, sin iniciar un segundo intento. 55 pruebas automatizadas cubren que 504 no se reintente y 503 siga siendo transitorio.
- **Reanudación posterior del catálogo, 03-11-2026:** después de que la raíz respondiera en 0,174 s, Chrome reanudó desde checkpoint. Una petición de subcarpeta volvió a exceder 15 s; la interfaz conservó el checkpoint. Se implementó y verificó en Chrome que el sincronizador aparca la carpeta 504 y sigue el resto. Tras cerrar y reabrir la pestaña, continuó desde el checkpoint y llegó a **5.410 carpetas revisadas/74.328 archivos encontrados**, sincronización activa. Durante el rastreo, `Fairy tial` siguió sugiriendo `FairyTail` y entregando 40 coincidencias offline; el Worker tardó unos segundos en asentarse durante lotes de actualización. El índice aún no terminó y el total real se desconoce.
- La vista previa cargó y mostró en Chrome una imagen real del índice (`/MP3s/Aerosmith/fanart.jpg`, 531 KiB) al abrirla manualmente desde resultados. Se verificó la carga on-demand; no hay precarga automática de miniaturas ni caché LRU.
- A 390×844 px, Chrome mostró búsqueda, rutas truncadas legibles, selección/favoritos y navegación inferior sin desbordamiento; la vista previa de imagen también quedó dentro del viewport. La revisión posterior detectó texto de sincronización comprimido en su tarjeta; se cambió a cuadrícula y la captura nueva confirmó el mensaje en la fila superior y el botón debajo. Se restauró el tamaño normal del navegador al terminar la revisión.
- **E2E en MazeOdyssey36External, 2026-11-04:** Android 16/API 36, x86_64, Emulator 37.2.13, AVD headless/SwiftShader. Se instaló/abrió el APK; WebView cargó la biblioteca y el plugin reportó destino `Descargas/Descargar UCLV`, 5.632.917.504 bytes libres de 6.228.115.456 (coherente con `df`: 5,2 GiB de 5,8 GiB). Se probó el permiso POST_NOTIFICATIONS concedido y denegado; al denegarlo, el enqueue se rechazó con explicación y la cola siguió vacía. Una entrada QA se encoló, pausó y conservó después de `am force-stop` y reapertura. La primera reanudación detectó `SecurityException` por falta de `ACCESS_NETWORK_STATE`; tras añadir el permiso y reconstruir, JobScheduler arrancó el UIDT (`userInitiatedApproved=true`), publicó la notificación ongoing y ejecutó el servicio. La conexión HTTPS al origen agotó los 15 s y se guardó `timeout`; el reintento manual lanzó otro UIDT y volvió a registrar el timeout. `remove` dejó cola vacía y quitó la notificación. La prueba QA se retiró y el permiso se restauró a concedido. No se obtuvo un archivo completo: escritura/publicación MediaStore, Range real y reanudación de bytes permanecen pendientes. La AVD estaba en `-no-window`: la captura del framebuffer fue negra, aunque el DOM de la WebView se pudo leer; esto no cuenta como aprobación visual. Evidencia detallada: [android-emulator-downloads-2026-11-04.md](evidence/android-emulator-downloads-2026-11-04.md).
- Pendiente: terminar el rastreo general (última lectura 5.410 carpetas/74.328 archivos; aún activo y reanudable), repetir descarga cuando el origen responda desde el emulador, verificar bytes/rango y archivo publicado con MediaStore, prueba de corte durante bytes, ENOSPC, perfiles de red, lector de pantalla, axe, Android 10–35 y dispositivo físico, escritorio empaquetado y release. El índice local y las categorías siguen disponibles mientras sincroniza.

### Actualización de descarga real

- Una entrada de lista Apache informó un tamaño redondeado, mientras `HEAD` devolvió el tamaño exacto. El gateway adopta `Content-Length` y vuelve a medir espacio antes de escribir; regresión cubierta por prueba HTTP fixture.
- La pantalla de descargas distingue el destino predeterminado del destino de cada trabajo. La respuesta API añade espacio disponible actual por destino; Chrome mostró el volumen correcto para la lista de prueba (18,9 GiB libres en Anime) junto al destino predeterminado (1,4 GiB libres).
- Un enlace del autoindex con codificación de porcentaje que no era UTF-8 hacía fallar el parseo de todo el directorio. El parser ahora escapa `%` literal y omite solo el enlace malformado; dos pruebas cubren esos casos.
- En una descarga de muestra, el volumen destino rechazó hard links; el motor reanudó sin volver a transferir y promovió el parcial completo con `rename` atómico. El archivo final coincidió en tamaño con `Content-Length` y `ffprobe` leyó metadatos de video/audio válidos. El origen no publicó checksum; no se afirma verificación bit a bit contra el servidor.
- El gestor ahora tiene 16 pruebas (tres nuevas cubren hard links no admitidos, rename ante colisión y parcial completo tras reinicio).
- El sincronizador tiene tres pruebas: segunda orden de inicio reutiliza corrida activa, pausa durante carpeta conserva último checkpoint y pausa durante reintento no deja espera/listener retenido y reanuda. En Chrome, el último estado observado tras reanudar desde la interfaz es 4.270/61.455 y permanece en curso.
- Registro anterior (2026-11-02): las pruebas pasaron 33/33. Tras el arreglo se reanudó la sincronización desde el checkpoint y siguió avanzando sin repetir el error. Una descarga de muestra se pausó durante un reinicio del gateway y retomó desde el parcial con Range/ETag. La cola conserva el destino elegido por trabajo.

Esta evidencia cubre una parte del plan. Las filas anteriores siguen abiertas hasta completar sus casos positivos, negativos, límite y recuperación en todos los targets declarados.

### Revisión adicional de resiliencia, responsive y escritorio — 2026-11-04

- `npm test`: 15 archivos, **74/74** pruebas correctas. Se añadieron regresiones del gestor de descargas con servidor fixture local: corte TCP después de recibir bytes y reanudación mediante `Range`/`If-Range`, comprobando SHA-256 final; y error de escritura `ENOSPC` inyectado, conservación del parcial, reanudación tras liberar espacio y comprobación SHA-256. ENOSPC se simula a nivel de stream; no representa un volumen Android físicamente lleno.
- Revisión visual del build de producción en Chrome aislado, en 360×800, 390×844, 768×1024 y 1440×1000: no hay desbordamiento horizontal. Las capturas móviles muestran encabezado, ilustración, sincronización, categorías y navegación inferior dentro del viewport. Se ajustó el arte decorativo del encabezado para evitar que amplíe la página en pantallas pequeñas.
- Barrido DOM en esas cuatro dimensiones: cero botones/campos visibles sin nombre accesible. Verificación de teclado: el primer Tab enfoca el enlace de marca con nombre y contorno visible de 3 px. Esto no cubre un recorrido completo, lector de pantalla ni auditoría automatizada axe/contraste.
- Manifiesto PWA servido por el preview declara `display: standalone`, `start_url: /` e iconos 192/512 SVG; el build de producción registra service worker. Esto permite instalar la web como app de escritorio desde un navegador compatible. No se generó un instalador nativo Windows/macOS/Linux; no forma parte del objetivo técnico elegido, que usa PWA.
- La descarga de system images Android 10/API 29 y Android 14/API 34 al disco externo se inició, pero la descarga de la imagen API 34 avanza muy lentamente (14% observado). Aún no hay AVDs nuevos ni pruebas ejecutadas en esas versiones. El emulador existente API 36 corresponde a Maze Odyssey y permanece intacto; no hay teléfono físico conectado.
- `npm run build` pasa. Vite conserva la advertencia de que el bundle JS principal supera el umbral recomendado de 500 kB minificado. La transferencia Android real contra `visuales.uclv.cu` sigue condicionada por la conectividad que en intentos anteriores cerró por timeout.
- Recarga offline de producción: tras precargar el shell y los ocho recursos esenciales, se cortó la red en Chrome aislado, se recargó y se verificó que el título y la interfaz React completas aparecían desde el service worker; luego se restauró la conectividad. No se simularon cambios del servidor ni una actualización de versión durante la desconexión.
- Stress de búsqueda repetido: 30k documentos, indexación+búsqueda inicial 668 ms, p50 3,15 ms/p95 6,10 ms, primera fuzzy 607 ms, heap delta 78,2 MiB; 100k, 1.259 ms, p50 12,19 ms/p95 14,25 ms, fuzzy inicial 2.066 ms, heap delta 129,7 MiB. Entorno Node; no equivale a rendimiento móvil/WebView.
- La pasada heurística de contraste inicialmente detectó pares de texto entre 3,5:1 y 4,4:1. Se oscurecieron tonos secundarios, descripción de sincronización, estado offline y etiquetas inactivas. Tras rebuild, el barrido de textos visibles (`h1`–`h3`, párrafos, spans, botones, enlaces, labels y small) no encontró pares por debajo de WCAG AA para texto normal. Es una comprobación DOM heurística, no sustituye axe ni una auditoría completa de estados/pseudoelementos.
- Se repitió responsive después de los cambios: 360×800, 390×844, 768×1024 y 1440×1000; `scrollWidth` coincide con el ancho de documento en cada tamaño y 0 controles visibles sin nombre accesible.
- `npm run android:sync` y `./android/gradlew -p android testDebugUnitTest assembleDebug --no-daemon --max-workers=2 --console=plain`: `BUILD SUCCESSFUL`. APK debug actual: 4.421.206 bytes, SHA-256 `dcb39782e59bd338cc2f6ca0a1795848023ee6e5cd101485ff602c1beab3cd55`. Se generó el APK con la revisión visual, pero no se instaló en la AVD activa: `dumpsys window` confirma Maze Odyssey en primer plano.
- Estado de descarga de imágenes al cierre de esta sesión: `sdkmanager` tiene solicitadas API 29 y API 34 al SDK del disco externo; API 34 sigue activa, 15% y aproximadamente 327 MB del ZIP temporal tras unos 25 minutos. API 29 aún no ha empezado a descargarse. Las dos imágenes siguen pendientes de instalación y creación de AVD; el proceso `sdkmanager` queda activo para continuar automáticamente con API 29 al terminar API 34.
- Ampliación de accesibilidad en Chrome DevTools Protocol: árbol AX de 153 nodos, 12 botones, 1 enlace y 1 campo de texto interactivos en Inicio; ninguno carece de nombre accesible. Se recorrieron 18 pasos Tab observando nombre y foco visible; el campo de búsqueda usa el anillo de `:focus-within` en su contenedor. El diálogo “Nueva lista” recibió foco en el campo rotulado, mantuvo la secuencia Tab dentro del diálogo y, con Escape, cerró y devolvió el foco al botón “Añadir a lista”. No se realizó prueba con lector de pantalla ni auditoría axe.
- Capturas revisadas del build responsive de producción: [móvil 390×844](evidence/visual-390-2026-11-04.png) y [escritorio 1440×1000](evidence/visual-1440-2026-11-04.png). El contenido de ejemplo carga completo, la tarjeta mantiene proporción y los elementos principales quedan legibles en ambas vistas.

- Prueba de instrumentación añadida y compilada para recuperación de una fila `PUBLISHING` con parcial local: debe terminar la publicación por MediaStore en `Download/Descargar UCLV/`, retirar `IS_PENDING`, preservar los bytes y limpiar la cola. APK de instrumentación generado (`android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`, 554 KB); aún no ejecutada en dispositivo, está condicionada a completar la imagen API 34 sin alterar la AVD de Maze Odyssey.
