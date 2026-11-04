# Diseño de arquitectura y clases

## 1. Criterios

- Mantener el producto personal local-first; se usa un gateway de loopback porque CORS no apareció en los sondeos y el browser no puede escribir directamente a la carpeta Downloads ni medir su espacio fiable.
- Separar dominio de catálogo/cola, UI y capacidades específicas de navegador/Android/escritorio.
- Nunca guardar un archivo grande dentro de IndexedDB; persistir metadatos y checkpoints allí, escribir contenido por streaming a un destino de archivos.
- Modelar nombres agrupados como metadatos/proyecciones de navegación; mantener las rutas y URL del origen intactas.
- Diseñar desde el inicio para cancelación, reinicio, desconexión, permisos revocados, cambios de espacio y versión de esquema.

## 2. Vista de sistemas

```text
React + TypeScript (PWA)
  ├─ UI: Explorar, Buscar, Listas, Favoritos, Cola, Destino, Ajustes
  ├─ Application services: Search, CatalogSync, Selection, DownloadPlanner
  ├─ Repositories: Catalog, Lists, Favorites (IndexedDB)
  └─ Same-origin API de loopback: catálogo, preview, destino y cola durable
       ├─ Gateway Node: allowlist HTTPS visuales.uclv.cu
       ├─ DownloadManager: un archivo a la vez, Range/If-Range, checkpoints `.part`
       ├─ Estado JSON atómico en el perfil del usuario; contenido en Downloads del SO
       ├─ Capacitor Android: transporte HTTPS/parseo nativo del catálogo, consulta MediaStore/espacio
       └─ Desktop instalable como PWA; Tauri se mantiene como opción posterior

Origen UCLV (índice Apache/HTTP; formato y CORS por confirmar)
```

El gateway es local y escucha solo en loopback; no es un backend remoto. Requiere que el proceso esté activo para transferir. El API de escritura valida `Origin`, JSON y header `X-UCLV-Request`; falta revisar endurecimiento frente a escenarios de loopback/DNS rebinding y threat-model completo antes de release. El APK necesita su propio adaptador nativo y no se acopla a rutas del gateway.

## 3. Capas

### Presentation

- Componentes sin llamadas de red directas.
- Formularios controlados y validación de dominio previa al comando de aplicación.
- Estado transitorio de selección en pantalla; persistir listas/jobs solo cuando el usuario guarda/añade.
- Cada estado visual derivado del dominio tiene nombre único y traducción accesible.

### Application

- Orquesta tareas, permisos y transacciones mediante interfaces.
- Nunca depende de `window`, `Capacitor`, `Tauri`, `File`, `fetch` global o ruta nativa concreta sin pasar por un port.

### Domain

- Entidades, objetos de valor, reglas de transición y cálculos puros.
- Sin dependencias de React, IndexedDB o APIs de sistema.

### Infrastructure

- IndexedDB versionada para datos estructurados.
- Adaptadores de HTTP, parser de índice, sistema de archivos, selector de destino, espacio disponible y notificaciones.
- La escritura parcial y finalización se ejecutan en el runtime con permisos adecuados.

## 4. Entidades y objetos de valor

| Clase / modelo | Campos principales | Invariantes |
|---|---|---|
| `CatalogNode` | `id`, `sourceId`, `parentId`, `kind`, `displayName`, `relativePath`, `canonicalUrl`, `mimeType`, `sizeBytes?`, `modifiedAt?`, `etag?`, `lastModified?`, `lastSeenAt`, `catalogVersion` | URL y ruta originales no se derivan del nombre normalizado; `sizeBytes >= 0`; raíz sin padre. |
| `CatalogSource` | `id`, `baseUrl`, `adapterType`, `lastSyncAt`, `syncState`, `sourceCapabilities` | Base permitida y validación de host; no seguir URLs fuera del origen/prefijo configurado. |
| `CatalogGroup` | `id`, `canonicalTitle`, `groupType`, `matchRule`, `confidence`, `reviewState` | Un grupo no cambia ni borra nodos originales; reglas ambiguas requieren revisión. |
| `GroupMember` | `groupId`, `nodeId`, `role`, `seasonOrder?`, `relationSource` | Relación reproducible, única y auditable. |
| `SearchDocument` | `nodeId`, `normalizedName`, `tokens`, `ancestorNames`, `pathTokens`, `kind`, `sizeBytes?` | Datos derivados reconstruibles desde el catálogo. |
| `SearchQuery` | `rawText`, `normalizedText`, `correctedText?`, `filters`, `sort` | Mantiene siempre la consulta original. |
| `DownloadList` | `id`, `name`, `createdAt`, `updatedAt`, `sortOrder`, `description?` | Nombre no vacío; orden determinista. |
| `DownloadListItem` | `id`, `listId`, `nodeId`, `addedAt`, `order`, `state` | Evitar duplicados por nodo/lista salvo que exista una acción explícita de copia. |
| `Favorite` | `nodeId`, `createdAt`, `note?` | Una entrada por nodo; nodo puede desaparecer del índice pero favorito conserva el último nombre/ruta. |
| `DownloadJob` | `id`, `nodeId`, `destinationId`, `listId?`, `status`, `priority`, `attempt`, `bytesCommitted`, `expectedBytes?`, `etag?`, `lastModified?`, `partKey`, `finalKey?`, `createdAt`, `updatedAt`, `lastError?`, `nextRetryAt?` | `0 <= bytesCommitted`; completed solo tras verificación; un job activo por destino+nodo salvo descarga duplicada confirmada. |
| `DestinationDescriptor` | `id`, `platform`, `displayName`, `opaqueHandle`, `permissionState`, `availableBytes?`, `checkedAt?`, `capabilities` | No persistir ni mostrar una ruta más detallada de lo necesario; espacio tiene timestamp y origen. |
| `NetworkProfile` | `maxConcurrency`, `idleTimeoutMs`, `maxAttempts`, `retryBaseMs`, `retryCapMs`, `jitter`, `maxRate?` | Valores dentro de límites seguros; concurrencia global y por host. |
| `CatalogSyncRun` | `id`, `sourceId`, `state`, `cursor/pendingDirs`, `visitedCount`, `itemCount`, `lastError`, timestamps | Checkpoint commit por lote; retomar idempotentemente. |
| `PreviewCacheEntry` | `nodeId`, `cacheKey`, `mimeType`, `byteLength`, `lastAccessAt`, `pinned` | Límites por bytes/edad; no cachear respuesta fallida como válida. |

Todos los IDs deben ser estables ante cambio de nombre si la URL/identidad remota es estable. Definir colisiones y `canonicalUrl` después de analizar redirects y codificación real.

## 5. Servicios e interfaces

- `CatalogAdapter`: `listDirectory(url, signal)`, `getCapabilities(url)`, `openRange(url, offset, validator, signal)`; devuelve respuestas tipadas y headers relevantes.
- `ApacheIndexParser`: convierte HTML `<pre>`/tabla en entradas; limita profundidad, host y prefijo; soporta URL encoding y `../` de forma segura.
- `CatalogSyncService`: agenda recorridos por lotes, estado/pausa/cancelación y commit idempotente.
- `CatalogRepository`: buscar/listar nodos por padre, actualización por lote y estadísticas.
- `SeriesGroupingService`: aplica reglas revisables con confianza/procedencia; no fusiona archivos físicamente.
- `SearchService`: normalizador, ranking exacto/prefijo/tokens/fuzzy, filtros, sugerencia de corrección y consulta original.
- `SelectionService`: resuelve el conjunto de descendientes, estado checked/partial/unchecked y tamaños conocidos/desconocidos.
- `DownloadPlanner`: convierte una selección en preview de plan, elimina duplicados, preserva estructura y estima bytes.
- `DestinationService`: permisos, carpeta predeterminada, selector, espacio disponible/capacidad y escritura segura.
- `SpaceCheckService`: suma exacta de tamaños conocidos, overhead temporal requerido, redondeo y revalidación antes de iniciar.
- `DownloadQueueService`: máquina de estado, concurrencia, prioridades, checkpoint, política de retry y recuperación al inicio.
- `DownloadManager` (implementación actual en gateway): cola secuencial persistida en JSON; `.part` junto a la ruta final; timeout por inactividad; dos reintentos rápidos; Range/If-Range; promoción por hard link sin reemplazo; recovery de estados `downloading` como cola al iniciar.
- `TransferAdapter`: stream remoto → archivo `.part`; Range/If-Range; progreso por bytes persistidos, no solo recibidos.
- `IntegrityService`: verifica rango, tamaño final y hash si existe; renombra/commitea de forma segura.
- `BackupService`: exporta/importa datos versionados con dry-run y reporte de conflictos.

### Backup v1 implementado

`backupRepository.export()` toma un snapshot de una sola transacción readonly de IndexedDB e incluye catálogo, favoritos, listas/snapshots y checkpoint de sincronización. No empaqueta descargas, archivos `.part`, destino ni credenciales: el estado de transferencia reside en el gateway y los archivos ocupan su carpeta de usuario. `parseBackup()` valida versión, límite de 250 MiB, forma de registros, IDs únicos, rutas sin traversal, estructura de padres y directorios de checkpoint antes de exponer una previsualización. Restore reemplaza los stores incluidos en una transacción IndexedDB y cambia `running` a `paused`, para evitar asumir que un worker sobrevivió. Las pruebas verifican importación y atomicidad de la transacción en IndexedDB con fixtures malformados; cuota agotada y Chrome UI siguen abiertas.

### Plataformas nativas

El proyecto generado por Capacitor 8.6 contiene el frontend de `dist` en el APK; el service worker PWA no se ejecuta dentro de Android. El gateway Node sigue siendo exclusivo de web/escritorio. Android implementa `NativeCatalogAdapter` con `CapacitorHttp` y parser compartido para listar y sincronizar sin gateway. `AndroidDownloadsPlugin` consulta `Download/Descargar UCLV` y el espacio del volumen en Android 10+ sin permiso amplio; no tiene todavía una escritura de archivos, MediaStore publish, cola o transferencias. La descarga nativa debe seguir D-013: persistencia de cola/validadores, parcial app-private, servicio/job por versión Android, progreso notificado, pausa/resume/recovery y publicación segura en `MediaStore.Downloads`. La UI no permite encolar Android hasta cerrar ese flujo. Android 7–9 aún requiere definir SAF/permisos.

## 6. Máquina de estados de descarga

`queued → checking-space → resolving → downloading → verifying → completed`

Transiciones laterales explícitas: `paused`, `waiting-network`, `retry-wait`, `waiting-space`, `waiting-permission`, `failed-retryable`, `failed-permanent`, `canceled`.

- Pausa y cancelación guardan checkpoint antes de confirmar el estado en UI.
- Errores DNS, timeout, conexión interrumpida y ciertos 5xx: retryable; 404/403, ruta inválida, disco lleno y permiso revocado: acción específica; no retry automático infinito.
- Si Range devuelve 200, validar tamaño y política antes de reiniciar desde cero; jamás anexar a `.part`.
- Si ETag/Last-Modified cambió, guardar parcial en cuarentena o pedir reinicio; no mezclar versiones.
- Un archivo recién completado queda visible solo tras persistir tamaño/verificación y moverlo a destino final.

## 7. Diseño de búsqueda

Pipeline: query cruda → normalización Unicode/acento/case/separadores → exact match → tokens/prefijos → distancia de edición limitada/n-gramas → ranking → sugerencia opcional.

Ranking prioritario: nombre exacto, frase/prefijo, coincidencia de tokens, carpeta ancestro, fuzzy. Limitar fuzzy en consultas muy cortas; aplicar debounce visual, no de persistencia. Resaltar por qué coincide. Para la sugerencia, umbral calibrado con errores reales y acción clara para volver a la consulta exacta. Agrupación de temporadas como resultado adicional; no ocultar archivos sueltos.

## 8. Estrategia de almacenamiento

- IndexedDB: catálogo, índices derivados, listas, favoritos, jobs, perfiles y permisos/handles admitidos.
- `SearchDocument` y miniaturas son rebuildable; exportación de usuario no los necesita salvo que mejore la restauración.
- Catálogo/listas/favoritos/checkpoint de crawl en IndexedDB. La cola del primer gateway local se persiste como JSON atómico en el directorio de estado del SO y cada `.part` vive junto al destino final para poder recuperar offset desde el sistema de archivos. Android y desktop tendrán repositorios/adaptadores propios.
- La cola del crawl mantiene estados `pending`, `complete` y `deferred`. Un timeout de listado (504) marca esa carpeta deferred, registra el contador y deja continuar las demás; al final queda `partial`. El usuario puede reintentar las carpetas aplazadas de forma explícita. Los errores permanentes distintos de 504 siguen visibles y detienen el recorrido.
- Esquema con `dbVersion`, migraciones atómicas y backup antes de migración destructiva.
- Reserva/caché nunca se trata como descargas del usuario; limpiar previews sin tocar listas, parciales ni archivos completados.
