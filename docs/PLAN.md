# Plan maestro de ejecución — Descargar UCLV

Versión 1 · 02-11-2026 · Estado: **prototipo PWA funcional; gates de release y targets nativos abiertos.** Se implementaron catálogo y búsqueda locales, navegación jerárquica, favoritos/listas, selección y preview de descarga, gateway local, índice por checkpoint, destinos, medición de espacio, cola secuencial durable y transferencias reanudables. Se verificó con fixtures y Chrome; el origen no se ha rastreado de forma general y no se inició una descarga real a gran escala. Consulte el registro de ejecución para el alcance exacto de cada evidencia.

El alcance detallado está separado para poder revisar requisitos, clases y QA sin perder el hilo:

- [Requisitos funcionales/no funcionales y reglas](REQUIREMENTS.md)
- [Arquitectura, clases y estados](ARCHITECTURE.md)
- [Flujos completos de usuario](FLOWS.md)
- [Verificación por campo, requisito y fase](VERIFICATION.md)
- [Sistemas, entornos y dependencias](SYSTEM_REQUIREMENTS.md)
- [Contexto y evidencia del origen](CONTEXT.md)
- [Registro de decisiones](DECISIONS.md)

## Resultado que se construirá

Una biblioteca local-first para `visuales.uclv.cu`: web instalable PWA, APK Android y escritorio si el prototipo de transferencias lo justifica. Mantiene índice y listas disponibles offline; busca con errores de escritura; navega toda la jerarquía; agrupa temporadas relacionadas sin cambiar sus rutas; deja seleccionar una franquicia/carpeta o partes; guarda favoritos y colas; previsualiza multimedia bajo demanda; usa Downloads/Descargas por defecto donde el runtime pueda; mide y muestra espacio antes de iniciar cuando el sistema lo permita; reanuda de forma íntegra tras red intermitente, cierre o reinicio.

No se considerará “terminado” por compilar. Una fase se cierra con requisitos trazados, interfaz revisada, pruebas de campo y flujo completo, registro de defectos, evidencia y aprobación de gate.

## Reglas de ejecución

1. Trabajar con fixtures locales hasta que el acceso y los límites del origen estén entendidos; nada de rastreos o lotes de prueba contra el sitio.
2. Diseñar y revisar cada pantalla/flujo antes de implementarlo; guardar variantes desktop y móvil.
3. Cada campo/control debe tener contrato: tipo, rango/formato, persistencia, estado inicial, permiso, error, mensaje, teclado/lector y caso de prueba (ver `VERIFICATION.md`).
4. Cada servicio/clase tiene una responsabilidad, interfaz/contrato y suite de pruebas de dominio o integración.
5. Todas las acciones de escritura se pueden recuperar o explicar; nunca perder una lista por falta de espacio o red.
6. Native y browser se describen con capacidades reales. PWA no promete descargas largas con la app cerrada.
7. Añadir nuevas decisiones como ADR con evidencia, alternativas y consecuencias.
8. No incluir backend hasta demostrar necesidad por CORS/limitaciones del origen y revisar su seguridad/costo operativo.

## Decisión y estado actual de Fase 1

Auditoría local y sondeo HTTP mínimo completados: ver `SOURCE_AUDIT.md`. Parser y sincronizador tienen cobertura de fixtures. El gateway local permite usar la PWA y limita las rutas al origen admitido; el acceso al sitio depende de la red de la UCLV. Actualización 2026-11-03: por solicitud del usuario comenzó la sincronización general con una sola petición de directorio a la vez; avanzó 15 carpetas en 20 s y guarda checkpoint recuperable. No se aumentará la concurrencia sin medir primero sus efectos en la red.

## Fase 0 — inicio y alcance (cerrada)

**Objetivo:** iniciar proyecto y acordar objetivo/cualidades.

- [x] Crear repositorio documental, `AGENTS.md`, skill, contexto, prompts, plan y registro de decisiones.
- [x] Identificar descargador Fairy Tail activo y preservarlo; localizar manifiesto e índice locales.
- [x] Guardar requisitos base de red inestable, offline, colas, búsqueda, accesibilidad y plataformas.
- [x] Preparar vistas previas de biblioteca y búsqueda/selección/espacio en desktop y móvil.
- [x] Obtener aprobación de la dirección visual inicial del usuario.

**Gate G0:** alcance y estilo aprobados. Las pantallas siguientes aún deben tener ficha y review antes de UI funcional.

## Fase 1 — descubrimiento técnico y auditoría local (antes de elegir adaptadores)

**Tareas**

1. [x] Inspeccionar en modo solo lectura índice, manifiesto, árbol y guía local; documentar que el snapshot enumera carpetas pero no archivos. No copiar datos personales al repo.
2. [x] Comparar con una inspección manual pequeña del origen: raíz, dos carpetas y un archivo; capturar status, latencia, content type, redirecciones, CORS y estructura Apache. Se comprobó antes que la transferencia vigente no estuviera activa.
3. [x] Verificar en un recurso pequeño HEAD, Range `0-0`, `206`, Content-Range, rango inválido, ETag/Last-Modified, longitud y URL encoding; no descargar el cuerpo completo.
4. [ ] Confirmar rutas originales de temporadas/películas y ambigüedades fuera del manifiesto Fairy Tail; registrar reglas de agrupación y confianza.
5. [ ] Evaluar miniaturas y reproducción: MIME, CORS, `Range` de video y controles nativos del navegador.
6. [ ] Definir contratos `CatalogAdapter`, `TransferAdapter`, límites de host/prefijo, concurrencia y retry policy desde datos medidos.
7. [ ] Resolver si PWA puede acceder al índice directo o hace falta backend/proxy; no levantar uno sin revisión de privacidad, permisos y despliegue.

**Entregables:** informe de compatibilidad del origen; fixtures anonimizados; decisión ADR del adaptador; métricas base; lista de restricciones confirmadas.

**Gate G1:** conocemos métodos de listar, previews y reanudar; cada incertidumbre restante tiene fallback UX. La descarga vigente no se toca.

**Estado de ejecución (2026-11-02):** auditoría local y sondeo remoto mínimo completados; resultados en `SOURCE_AUDIT.md`. Gateway y parser local implementados, con rutas limitadas al host; transporte nativo queda pendiente. El estado histórico del descargador personal quedó en 73/355 y conserva un parcial; en la comprobación posterior de esta sesión no había proceso activo. No se ha tocado ni relanzado. Quedan las pruebas de media, catálogo amplio y definición final de política de rastreo. No declarar un gate cerrado sin evidencia.

## Registro de ejecución (02-11-2026)

- **F0:** cerrada. Incluye documentación base, `AGENTS.md`, skill local, prompts, contexto, requisitos, arquitectura, flujos, matriz QA y previews estáticos desktop/móvil.
- **F1:** parcialmente completada; auditoría Apache index, HEAD, Range/206, ETag, Last-Modified, encoding y falta de CORS observada en respuestas puntuales. Sin prueba browser directa del origen, previews multimedia, catálogo extenso ni evaluación formal de carga permitida. G1 sigue abierto.
- **F2:** previews iniciales aprobados por el usuario; interfaz funcional se revisa incrementalmente. G2 no se cierra hasta revisar flujos restantes con accesibilidad y métricas.
- **F3:** Vite/React/TypeScript, PWA manifest/service worker y gateway local compilables. `npm audit` dio cero hallazgos tras retirar plugin PWA vulnerable. G3 abierto por faltas de lint/formatter, arquitectura y build reproducible nativo.
- **F4:** IndexedDB v2 para catálogo, favoritos/listas con snapshots y checkpoint por carpetas. Migración v1→v2 probada con fake IndexedDB y apertura del DB existente en Chrome. Backup v1 exporta catálogo/favoritos/listas/checkpoint; validador comprueba límites, IDs, árbol y rutas; restore reemplaza stores en una transacción y reanuda sync como pausada. 4 pruebas cubren vista previa y restauración. Falta QA visual en Chrome, quota failure y benchmark 100k; G4 abierto.
- **F5:** búsqueda exacta local con Fuse fuzzy diferido en Web Worker para catálogos de 5k+ elementos, índice incremental, limitación de consultas pendientes, fallback síncrono, sugerencia de corrección, agrupación Fairy Tail y navegación implementados. En Chrome con catálogo local de ~61k, `Fairy tial` sugirió `FairyTail`, mostró 40 resultados offline; en la repetición el buscador respondió mientras corría el rastreo. Los timeouts 504 ahora aparcan esa carpeta, el rastreo prosigue y la UI indica índice parcial y permite reintento manual. Última prueba de estrés en Node, 30k/100k: p95 5,85/14,46 ms, fuzzy inicial 457/1.688 ms; no mide Worker ni memoria en dispositivo. G5 sigue abierto para crawl completo, perfil de memoria en Android y virtualización.
- **F6:** selección jerárquica, resumen bytes, favoritos, listas crear/renombrar/añadir/quitar/duplicar/reordenar/eliminar con snapshot de elementos, preparación/confirmación del plan (tamaño, duplicados, destino y espacio) comprobados en Chrome. Falta el recorrido E2E de lista completa hacia cola y confirmación de rama grande. G6 abierto.
- **F7:** gateway local propone `~/Downloads/Descargar UCLV` (análogo por OS), permite escribir ruta absoluta, comprueba escritura y consulta `statfs`; mide capacidad antes de aceptar colas e items. Cada job fija su destino. Sin selector nativo, adapter Android/Desktop ni matriz de permisos/capacidades. G7 abierto.
- **F8:** `DownloadManager` local secuencial implementado con estado JSON sincronizado/escrito de forma atómica, archivos `.part`, Range/If-Range con ETag/Last-Modified, cierre/reinicio, pausa/reanudar/quitar, máximo 2 retries breves con jitter, timeout de inactividad 15 s, Content-Range/tamaño, no sobrescribe archivos y redirects limitados al host. El UI muestra destino, espacio, progreso, estados/errores por archivo y permite encolar una selección o lista. Pruebas fixture local confirman reanudación/SHA-256, pausa activa conservando el parcial, 503 retryable, 404 permanente que no bloquea el resto, ETag cambiado → 200 reinicia sin anexar, 416 preserva parcial sin retry, reconciliación tras crash, destino persistente, dedupe, traversal y colisión. Falta ENOSPC, caída abrupta de proceso/SO, redirect cross-host en API, directory fsync, threat-model completo y plataformas nativas. G8 abierto; no usar con lotes reales aún.
- **F9:** vista bajo demanda conectada a `/api/file`; un MP4 real respondió con metadatos 864×480 y 1464.96 s en Chrome. La imagen real se verificó después; faltan playback completo/checksum, Range efectivo, errores, thumbnails automáticas y caché LRU. G9 abierto.
- **F10–F12:** texto secundario mínimo 12 px, controles 14 px, campos de texto 16 px y navegación de 44 px. Chrome comprobó nombres accesibles de 0 controles ausentes, foco inicial/ciclo Tab/Escape/restauración de foco en diálogos. Capacitor Android 8.6 tiene appId, icono, splash, manifest endurecido y assets sincronizados. Se instalaron Android SDK 36, build-tools/platform-tools y JDK 21; el APK debug compila y su firma/manifest están verificadas. La APK se instaló y ejecutó en un Android virtual alojado, con evidencia en `VERIFICATION.md`; no hay dispositivo físico. Contraste completo, lector de pantalla, worker nativo, escritorio empaquetado, hardening y release siguen abiertos.

**Evidencia anterior (2026-11-02):** `rtk npm run android:build:debug` generó el APK firmado en modo debug (firma APK v2; appId `cu.uclv.descargar`; min SDK 24/target SDK 36). `rtk npm test` 33/33; `rtk npm audit --omit=optional` reporta 0 vulnerabilidades. Chrome comprobó listas, selección, destino, espacio, preview y layouts de 360 a 1440 px. La auditoría DOM comprobó nombres accesibles, foco inicial, ciclo Tab/Escape y restauración de foco. Backup exporta JSON; su validador y restauración están cubiertos por Vitest. API local midió espacio y bloqueó origin remoto/traversal. El crawler general sigue en curso y reanudable. Esto no reemplaza la matriz completa de `VERIFICATION.md`.

**Actualización de continuación (2026-11-04):** el índice sigue guardándose en IndexedDB por carpeta y puede continuar tras cerrar el navegador; el crawl de 5.410 carpetas/74.328 archivos quedó en curso según la última evidencia del 03-11 y no se reinició. Se añadió al APK una ruta directa HTTPS para consultar/sincronizar el catálogo, con el parser compartido, allowlist exacta, límite de redirecciones, timeouts de 15 s y errores 504 diferibles. Tests y compilación web pasan; se está validando la compilación Android. La APK aún no descarga archivos ni puede prometer reanudación de transferencias: el motor Android con MediaStore/worker durable y destino/espacio sigue siendo el bloqueo funcional principal. Ver D-012.

**Validación Android virtual (2026-11-03):** el APK debug se instaló y abrió en Android x86_64, 720×1616. Se probaron búsqueda con errores de escritura, sugerencia, navegación, selección de contenido, Favoritos y listas con datos de ejemplo. El plan de descarga bloqueó la cola cuando el destino no estaba disponible. No se inició ninguna transferencia. Logcat no mostró `FATAL EXCEPTION` atribuible a la app. Evidencia: `docs/evidence/android-queue-review.jpg`. El APK aún no trae el adaptador nativo del gateway ni descarga nativa.

## Fase 2 — especificación, arquitectura lógica y diseño de interfaz (antes de programar UI)

**Tareas**

1. Revisar `REQUIREMENTS.md` con IDs, prioridad Must/Should/Could, criterio observable, dependencias y fuera de alcance.
2. Completar modelo de conceptos y relaciones en `ARCHITECTURE.md`: nodo, grupo, temporada, lista, favorito, job, destino, perfil de red, caché y corrida de sincronización.
3. Cerrar requisitos de campo con validación, persistencia, estado vacío/error, accesibilidad, permisos y prueba (matriz en `VERIFICATION.md`).
4. Elaborar wireframes y prototipo para Inicio, Explorar/lista/cuadrícula, Buscar/resultados, carpeta de temporada, selección/confirmación, Listas, Favoritos, Cola/Historial, Media viewer, Destino/Espacio, Ajustes, Offline/errores y backup.
5. Diseñar responsive con breakpoints por contenido, no por dispositivo; estados hover/focus/pressed/disabled/loading/partial selection; contraste/escala de texto/movimiento reducido.
6. Probar tareas clave en Chrome (usuario autorizó abrirlo siempre), dimensiones 360×800, 390×844, 768×1024 y 1440×900; Android real más adelante.
7. Revisar lenguaje con pruebas de comprensión: niños/adultos, personas no técnicas y 60+ si están disponibles; corregir antes de cerrar diseño.
8. Aprobar navegación/IA, tokens de diseño, iconografía, textos y flujos de recuperación.

**Entregables:** mapa de pantallas, prototipo clickable, design tokens, componente/estado inventory, review log y matriz a11y.

**Gate G2:** todos los flujos principales tienen inicio, éxito, cancelación, offline, error y recuperación; usuario aprueba prototipo antes de implementar frontend.

## Fase 3 — scaffold técnico y reglas de calidad

**Tareas**

1. Confirmar Vite + React + TypeScript; PWA; IndexedDB; Capacitor Android; decidir si Tauri entra tras prueba de filesystem.
2. Fijar versiones del runtime/SDK y lockfile; documentar build reproducible para hosts disponibles.
3. Estructurar módulos por dominio/application/adapters/presentation, reglas import boundary y nombres.
4. Configurar validación estática, lint, format, tipos, scripts de build/preview, fixtures y CI solo según autorización/límite de infraestructura.
5. Agregar esquema de configuración y manejo de secretos/URL allowlist; sin credenciales en cliente.
6. Definir logging local, redaction, crash/error codes y exportación de diagnóstico sin datos personales.

**Entregables:** repo ejecutable, diagrama actualizado, ADR de stack, comandos y guía de entorno.

**Gate G3:** build limpio y dependencias revisadas; reviewers confirman límites de plataforma y no hay infraestructura innecesaria.

**Ejecución actual:** scaffold Vite/React/TypeScript, gateway local, PWA, lockfile y scripts de build/test implementados. Build y auditoría de dependencias pasan. Sin CI añadida. No cerrar G3 hasta completar la revisión de seguridad y el proceso reproducible de distribución nativa.

## Fase 4 — dominio, persistencia y migraciones

**Tareas**

1. Implementar modelos/validadores/invariantes de `ARCHITECTURE.md` antes de pantallas.
2. Crear esquema IndexedDB versionado, repositories y migraciones transaccionales.
3. Añadir exportación de backup, preview de import y rollback.
4. Probar fixture sintético con 30k nodos de directorio y documentos de archivo; ampliarlo a 100k elementos mixtos cuando la auditoría dé una distribución representativa; medir virtualización y memoria.
5. Modelar `DownloadJob` y su máquina de estados formal; transiciones válidas/ilegales con pruebas.

**Entregables:** dominio/repositories; catálogo/backup versionados; informe de integridad y performance.

**Gate G4:** migración y recuperación ante interrupción probadas; no existe una pantalla que guarde estado solo en React memory.

**Ejecución actual:** IndexedDB versionada y migración v1→v2 verificada en test y Chrome; favoritos, listas, catálogo y checkpoint sobreviven al reinicio de vista. La aplicación no consulta listados al abrir: solo lo hace por acción de sincronización. Se añadió solicitud de almacenamiento persistente del navegador, estado de protección/uso/cuota en Ajustes y aviso específico si IndexedDB se queda sin espacio; denegaciones conservan la copia local, pero se recomienda exportar respaldo. Prueba nueva cierra y reabre la conexión IndexedDB comprobando entradas confirmadas y carpetas pendientes. Persistencia durable de descargas está en el gateway. El benchmark 30k/100k completó; backup/restore visual y casos de cuota/fallo inyectado siguen pendientes, por lo que G4 continúa abierto.

## Fase 5 — catálogo, indexación y motor de búsqueda

**Tareas**

1. Parsear fixtures Apache `<pre>`/tabla, escapar HTML, normalizar entidades y URL, rechazar host/prefijo ajeno y traversal.
2. Implementar sync por lote/cursor/checkpoint, cancelación, detección incremental y estado del último índice.
3. Construir SearchService local: normalización Unicode, exact/prefix/tokens/fuzzy, autocorrección con threshold y ranking explicable.
4. Agrupar series/temporadas con reglas revisables, aliases y preservación de paths.
5. Mantener el camino común por debajo de p95 <200 ms en 30k documentos; verificar consultas concurrentes, consistencia tras actualizaciones incrementales y memoria del Worker en Chrome móvil de gama baja.
6. Implementar navegación de árbol, breadcrumbs, sort/filter, virtualización y empty states.

**Entregables:** catálogo local consultable, search golden set, import del inventario de fixtures, reporte p95 y UI de browse/search aprobada.

**Gate G5:** una sesión completa de buscar con typo → corregir → abrir ruta funciona offline, con resultados explicables y sin duplicados.

**Ejecución actual:** parser Apache, sincronización secuencial con checkpoint, coincidencia exacta local con Fuse.js diferido para fuzzy en Worker (catálogos >=5k), actualización incremental, sugerencia de corrección, navegación y agrupación Fairy Tail implementados. Para Android, el nuevo adaptador nativo consulta el listado del origen y reutiliza el parser; falta comprobarlo en dispositivo conectado. Stress 30k/100k ejecutado; ver métricas de motor Node y límites de memoria en D-010. Chrome verificó typo y respuesta del campo con ~61k elementos locales. Catálogo general, golden set, memoria Android y virtualización siguen pendientes; G5 abierto.

## Fase 6 — selección, listas, favoritos y planificador de descargas

**Tareas**

1. Resolver grupo→temporada→carpeta→archivo; checked/partial/unchecked y “seleccionar todo” de alcance explícito.
2. Crear `SelectionService` que cuenta IDs únicos y suma tamaño conocido, desconocido y overhead de temporales.
3. Crear/renombrar/duplicar/reordenar listas; fusionar duplicados con decisión explícita.
4. Favoritos persistentes en cualquier nivel; conservar snapshot si desaparece del índice.
5. Diseñar `DownloadPlanPreview`: destino, total, tamaño/estimado, duplicados, archivos omitidos y espacio.
6. Revisar seguridad de confirmar rama grande; no requerir diálogo repetitivo para pocos archivos.

**Entregables:** FL-04 listo; verificación exacta de un fixture Fairy Tail de 4 temporadas+película.

**Gate G6:** selección con padres parciales persiste correctamente y lista no inicia job antes del preview de plan.

**Ejecución actual:** selección jerárquica, favoritos, CRUD/orden/duplicación de listas, snapshot y plan previo conectados; se verificó el fixture en Chrome. G6 requiere todavía cerrar los casos de alcance padre/parcial y revisión completa de la matriz de campos.

## Fase 7 — destinos, espacio y permisos

**Tareas**

1. Definir `DestinationAdapter` por web/Android/Desktop.
2. Android: MediaStore Downloads; gestión de temporales/cambio de nombre, visibilidad al usuario y restricciones por SDK.
3. Desktop: selector del SO, handle permitido, `statvfs`/equivalente y protección ante unidades retiradas.
4. Web: navegador `Downloads`, `showDirectoryPicker` si está soportado y autorizado, fallback nativo de descarga; diferenciar cuota de sitio y disco.
5. Calcular bytes de cola y temporales; mostrar unidad; revalidar al iniciar y manejar espacio que disminuye durante la transferencia.
6. Guardar preferencias/URI con política de restauración al permiso revocado.

**Entregables:** matriz plataforma-capacidad, copy UX de límites, pruebas de poco espacio/permiso y destino.

**Gate G7:** nunca se presenta espacio simulado como real; suficiente, insuficiente y desconocido tienen comportamientos revisados.

**Ejecución actual:** gateway expone destino local editable y espacio libre de filesystem; destino por defecto `Downloads/Descargar UCLV`. UI y API revisadas en Chrome. El APK todavía no tiene adaptador de destino ni consulta fiable de espacio; destino Android y pruebas reales de falta de espacio/permisos están pendientes; G7 abierto.

## Fase 8 — motor de descargas resiliente

**Tareas**

1. `TransferAdapter` HTTP con stream, headers de rango, timeout de inactividad, progreso de bytes comprometidos y abort.
2. Persistir `.part`/URI y checkpoints atómicos; guardar ETag, Last-Modified, content length y último offset verificado.
3. Implementar Range/If-Range; detectar 200/206, Content-Range incorrecto, validadores cambiados y redirects fuera de allowlist.
4. Implementar concurrencia limitada y fair queue; empezar conservador; medir combinaciones en fixture.
5. Política de retries de demora breve/acotada con jitter; límite de intentos + deadline; distinguir retryable/permanent; permitir retry manual.
6. Validar tamaño/hash; promover parcial a final con operación segura y no sobreescribir archivo local sin decisión.
7. Android: worker/foreground runtime adecuado y notificación clara; desktop: worker local durable; PWA: capacidad mientras navegador la mantiene viva.
8. Recuperación startup: reconciliar DB vs `.part`, archivo ya final, falta de destino o nuevo ETag.

**Entregables:** transfer engine y tabla de errores; pruebas de cortes/reinicio/rangos; tutorial E2E de job retomado.

**Gate G8:** checksum final igual al fixture tras corte a varios offsets y reinicios; no hay concatenación incorrecta ni retry infinito.

**Ejecución actual:** cola secuencial persistente, `.part`, Range/If-Range, validación de rango/tamaño, promoción sin sobrescritura, timeout de inactividad, pausado/reanudación y retry corto/acotado implementados. 16 pruebas del gestor de descargas verifican fallos, reinicio y checksum con servidor fixture. Aún falta ejercicio prolongado con perfiles de red y revisión de seguridad antes de cerrar G8.

## Fase 9 — multimedia e imágenes

**Tareas**

1. Confirmar compatibilidad de CORS/MIME/rango por plataforma.
2. Visor de imagen/video con fallback abrir original/descargar.
3. Cargar metadatos primero; miniaturas visibles y de carpeta abierta/fijada después.
4. Caché LRU limitada por bytes, cancelación y limpiar caché sin borrar descarga completada.
5. Accesibilidad: alt basado en nombre/ruta, controles de media por teclado y error playback.

**Gate G9:** abrir imagen/video, volver sin perder ruta/selección y funciona el fallback sin CORS.

**Ejecución actual:** preview lazy de video con controles nativos y fallback; Chrome obtuvo metadatos de un MP4. Una imagen real del índice se abrió correctamente en Chrome desde la vista previa bajo demanda; caché LRU, cancelación y matriz de errores siguen pendientes; G9 abierto.

## Fase 10 — UI final y accesibilidad integral

**Tareas**

1. Implementar pantallas a partir de G2 tokens/prototipo aprobado, con componentes tipados y forms con validación inline.
2. Completar navegación desktop, tablet y móvil; sticky actions sin tapar contenido; texto ajustable.
3. Conectar cada control a casos de `VERIFICATION.md`, evitar botones mock/no-op.
4. Review campo por campo, teclado/lector, contraste, tamaño de toque, español y mensajes simples.
5. Moderar tareas con diversidad de edad/habilidad, grabar hallazgos no sensibles y priorizar fixes.

**Gate G10:** cero controles sin acción implementada; matriz de campos verificada al 100%; ningún problema crítico de a11y/usabilidad.

**Ejecución actual:** responsive revisado en 360, 390, 768 y 1440 px. Se elevó el mínimo tipográfico de metadata y los objetivos de toque de controles compactos; 26 tests pasan. Revisión completa con teclado/lector, contraste, ampliación de texto y personas usuarias aún pendiente; G10 abierto.

## Fase 11 — PWA, APK y escritorio

1. PWA offline: precache de shell, actualización de versiones sin perder IndexedDB, instalación y recuperación si service worker actualiza.
2. APK Capacitor: APK debug/release reproducible, storage permissions mínimos, MediaStore, orientación/tamaños, background constraints.
3. Prueba Tauri de esfuerzo por plataforma; decisión coste/beneficio antes de construir distribución completa.
4. Validar instalaciones limpias, actualización encima, downgrade recovery, datos conservados y uninstall/export warning.

**Gate G11:** cada target declarado tiene smoke E2E y matriz de capacidades comprobada en dispositivo real.

**Ejecución actual:** PWA precarga `index.html`, activos, manifiesto e iconos; shell offline comprobado en el build. APK debug reproducible y firmado, probada en Android virtual: búsqueda offline, agrupación y selección de serie, navegación a carpeta y favorito visible en Favoritos; logcat no presentó `FATAL EXCEPTION`. Se añadió adaptación nativa de catálogo/sincronización (D-012); la compilación de esta actualización está en curso y falta validar una conexión real desde el APK. La APK todavía no descarga ni reanuda transferencias. El emulador local no quedó operativo porque la imagen de sistema descargada se corrompió; la verificación previa se completó en Ramus. No hay teléfono físico ni binario de escritorio. G11 abierto.

## Fase 12 — hardening, release y operación

- Revisar dependencias/vulnerabilidades, allowlist de host, parser, rutas, contenido HTML, logs y backups.
- Ejecutar test pyramid de `VERIFICATION.md` y perfil de red variable sin tráfico masivo real.
- Corregir P0/P1; P2 documentado/aceptado con workaround.
- Verificar restauración desde backup y proceso de actualizar DB/worker.
- Preparar guía de instalar/actualizar, elegir destino, resolver poco espacio y entender fallos.
- Registrar release, lockfile, versionado, hash de artefactos y capacidades probadas.

**Gate G12:** matriz requirements→evidencia al 100%, cero P0/P1 abiertos, backup válido y aprobación final.

## Orden de dependencias

```text
F1 origen ─┬─> F2 diseño ─> F3 scaffold ─> F4 dominio/persistencia
           │                                  ├─> F5 catálogo/búsqueda ─> F6 selección/listas
           └─> decisión backend                    └─> F7 destino/espacio ─> F8 transferencias
                                                                              └─> F9 multimedia
F2 ─> F10 UI final ─> F11 plataformas ─> F12 release
```

La UI puede implementarse incrementalmente después de F2, usando ports/mocks locales; la integración real al origen espera G1. APK nativo de descarga espera G7 y G8.

## Definition of Done por requisito

- Requisito `REQ-*` relacionado en PR/entrega.
- Contrato/campo/clase actualizado y revisión de impacto hecha.
- Happy path + validación negativa + límite + recuperación probados.
- Estados de loading/empty/offline/error/disabled revisados en desktop/móvil.
- Teclado/lector/contraste para controles nuevos.
- Evidencia guardada con build/browser/OS y link de defecto si aplica.
- Docs de arquitectura, flujo, plan y decisiones sincronizados.
- Ningún botón/campo se queda simulado o sin verificar.

## Seguimiento

Mantener cada tarea con `ID`, fase, dependencias, owner, estimación, riesgo, evidencia y gate. Estimar calendario solo después de G1/G2 y un prototipo del motor, pues CORS, Range, Android y destino pueden cambiar el esfuerzo.
