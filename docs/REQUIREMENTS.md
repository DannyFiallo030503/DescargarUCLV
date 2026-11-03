# Especificación de requisitos

Versión inicial: 1.0 · Estado: base para diseño y revisión · Producto personal, sin cuentas ni monetización.

## 1. Objetivos medibles

- **R1:** Una vez indexado el origen, navegar carpetas y buscar no requieren una petición al servidor para cada consulta.
- **R2:** Una búsqueda con un error habitual sigue mostrando resultados útiles o una sugerencia corregible, sin esconder resultados exactos.
- **R3:** Seleccionar una serie completa, una o varias temporadas, o archivos individuales conserva la jerarquía y muestra el alcance antes de encolar.
- **R4:** Listas, favoritos, preferencias y checkpoints sobreviven al cierre, reinicio y pérdida de red.
- **R5:** Reanudar añade bytes solo cuando el servidor valida el rango y el recurso no cambió.
- **R6:** Antes de empezar una descarga o lista se muestra el destino, el tamaño conocido y el espacio disponible cuando la plataforma lo exponga.
- **R7:** Ningún fallo de espacio, red, permisos o disco se presenta como una descarga exitosa.
- **R8:** El diseño funciona con tacto, teclado y lector; se puede usar en 360 px de ancho sin perder acciones principales.

## 2. Requisitos funcionales

| ID | Requisito | Criterio de aceptación |
|---|---|---|
| REQ-CAT-01 | Descubrir el índice | El adaptador registra carpetas/archivos, tipo, ruta original, tamaño disponible y fecha/validador cuando existan. El proceso se puede pausar y retomar. |
| REQ-CAT-02 | Ver el catálogo offline | Al abrir sin red se muestra la última versión local y su fecha; se distingue contenido indexado de contenido recién confirmado. Abrir/reiniciar no vuelve a consultar listados ni borra el índice. |
| REQ-CAT-03 | Navegar carpetas | Se abre cada carpeta, se muestra breadcrumb, se vuelve al padre y se identifica el tipo de contenido. |
| REQ-SRC-01 | Buscar localmente | La consulta se resuelve sobre el índice local; se puede abrir la ruta encontrada sin volver al origen. |
| REQ-SRC-02 | Tolerar errores | Normalizar mayúsculas, acentos, puntuación, espacios y errores simples. Mostrar una sugerencia con acción explícita; conservar “buscar exactamente lo escrito”. |
| REQ-SRC-03 | Ordenar resultados | Coincidencias exactas primero; luego prefijos/tokens y fuzzy. Incluir tipo, ruta, tamaño si existe y razón de agrupación. No cambiar silenciosamente la consulta. |
| REQ-SEL-01 | Seleccionar una rama | Una casilla en grupo/serie selecciona todos sus descendientes visibles y ocultos; al desmarcar un hijo el padre refleja estado parcial. |
| REQ-SEL-02 | Selección granular | Se pueden marcar/deseleccionar temporadas, carpetas y archivos individualmente, además de “seleccionar todo en esta carpeta”. |
| REQ-SEL-03 | Revisar alcance | Antes de añadir, indicar cantidad de archivos/carpetas, tamaño total conocido y elementos con tamaño desconocido. |
| REQ-LST-01 | Mantener listas | Crear, renombrar, ordenar, duplicar como nueva, añadir elementos y conservar cada lista entre sesiones. |
| REQ-FAV-01 | Favoritos | Añadir/quitar carpeta o archivo y filtrar favoritos sin conexión. |
| REQ-DL-01 | Cola durable | Cada elemento tiene estado persistente, orden, prioridad, bytes confirmados, fecha/error y acción permitida. |
| REQ-DL-02 | Reanudar con seguridad | Range + Content-Range válidos y ETag/If-Range o validador equivalente; si el servidor devuelve el archivo completo, recurso cambiado o rango inválido, no concatenar y explicar qué ocurre. |
| REQ-DL-03 | Red variable | Timeout por inactividad, número máximo de intentos configurable, reintento rápido con jitter y pausa manual; errores permanentes no entran en ciclo automático. |
| REQ-DL-04 | Prioridad y control | Pausar, reanudar, reintentar, mover prioridad y cancelar; cancelar no elimina un archivo ya completo sin acción expresa. |
| REQ-DST-01 | Destino por defecto | Proponer Downloads/Descargas del sistema en los runtimes nativos; persistir elección por dispositivo. La web usa el destino que el navegador permite y lo declara con claridad. |
| REQ-DST-02 | Cambiar destino | Abrir selector de archivos del sistema, mostrar nombre/ruta descriptiva y poder restablecer el predeterminado. Guardar el permiso/URI de forma segura. |
| REQ-DST-03 | Capacidad | Mostrar espacio real del volumen autorizado si está disponible; nunca sustituirlo por cuota web sin etiquetarla. Revalidar antes del inicio. |
| REQ-DST-04 | Espacio insuficiente | Si no cabe todo, bloquear “descargar selección completa”, dejar crear la lista para después y ofrecer otra carpeta o selección parcial. |
| REQ-MED-01 | Previsualizar | Abrir imagen/video compatible en visor; usar carga diferida, controles accesibles y alternativa de abrir/descargar el original. |
| REQ-IMG-01 | Miniaturas | Descargar miniatura solo en carpeta abierta o fijada, priorizar lo visible y respetar límite de caché. No bloquear navegación. |
| REQ-SET-01 | Ajustar conexión | Mostrar concurrencia, timeout, reintentos y perfil de red con valores seguros; explicar alcance y permitir restaurar valores por defecto. |
| REQ-DAT-01 | Respaldo local | Exportar/importar catálogo guardado, listas, favoritos y checkpoint de sincronización con esquema versionado; validar todo antes de reemplazar datos; conservar intactas las descargas y el destino local. |
| REQ-APP-01 | PWA | Instalable por HTTPS, shell offline y metadatos locales durables. Comunicar que el navegador puede suspender una descarga de larga duración. |
| REQ-APP-02 | APK | Capacidades nativas de Filesystem, destino Downloads, espacio y notificación/progreso según compatibilidad Android. |
| REQ-APP-03 | Escritorio | Evaluar Tauri; mismo frontend, acceso a ruta elegida y capacidad de reanudación nativa. No bloquear web/APK por esta opción. |

## 3. Requisitos no funcionales

| ID | Área | Criterio verificable |
|---|---|---|
| RNF-PERF-01 | Búsqueda | En un fixture sintético reproducible de 30,000 documentos buscables (no es un recuento del sitio), p95 menor de 200 ms en el dispositivo de referencia; ampliar a 100,000 para margen. Revisar tras conocer la cantidad real de archivos. |
| RNF-PERF-02 | Respuesta | Acción de pausa y cambios de selección responden en menos de 150 ms sin bloquear scroll. |
| RNF-RES-01 | Recuperación | Interrumpir proceso después de checkpoint, reiniciar, continuar sin duplicados ni corrupción. |
| RNF-RED-01 | Reintentos | Toda secuencia tiene timeout, límite de intentos/deadline y motivo final visible; medir tiempos en perfil de red lento. |
| RNF-ACC-01 | Accesibilidad | WCAG 2.2 AA: contraste, foco, teclado, etiquetas y estado accesible de controles/errores. |
| RNF-UX-01 | Comprensión | Tareas de buscar, escoger una temporada, elegir destino y pausar se completan sin asistencia en prueba moderada con personas de edades y experiencia variadas. |
| RNF-PRIV-01 | Privacidad | Sin telemetría/cuenta por defecto; no registrar tokens, contenido privado ni nombres completos de rutas sin necesidad. |
| RNF-STO-01 | Integridad | Base local migrable con transacciones; temporales separados de la base; finalización atómica o equivalente por plataforma. Solicitar almacenamiento persistente del navegador si existe, informar resultado/uso/cuota y permitir respaldo exportado fuera del almacenamiento del sitio. |
| RNF-COMP-01 | Portabilidad | Reglas de selección/cola no dependen del framework ni de una ruta POSIX/Windows concreta. |

## 4. Reglas de negocio

1. El catálogo describe lo conocido del origen; una entrada local puede estar obsoleta y debe incluir fecha de actualización.
2. Agrupar por serie es una capa de descubrimiento; nunca reemplaza ni altera la ruta original.
3. Seleccionar padre implica seleccionar todos los elementos contenidos en ese grupo; el resumen incluye tamaños desconocidos.
4. Solo se marca un archivo completo tras verificar longitud final y, cuando exista, checksum/validador.
5. “Quitar de la lista” y “borrar archivo descargado” son acciones distintas.
6. La cola no se pierde por falta de espacio: mantiene estado “espera por espacio” hasta que cambie el destino o haya capacidad.
7. Si la plataforma no puede consultar espacio real, se muestra el límite y se utiliza escritura con detección segura de `ENOSPC`/equivalente.
8. La sugerencia fuzzy nunca cambia la búsqueda sin acción del usuario.

## 5. Fuera de alcance inicial

Usuarios multi-cuenta, compartir listas en la nube, sincronización entre dispositivos, reproducción transcodificada/proxy, publicación comercial, rastreo masivo frecuente y eliminación automática de archivos locales.

## 6. Prioridad inicial (MoSCoW)

- **Must (primera versión utilizable):** REQ-CAT-01..03, REQ-SRC-01..03, REQ-SEL-01..03, REQ-LST-01, REQ-FAV-01, REQ-DL-01..04, REQ-DST-01..04, REQ-SET-01, REQ-APP-01..02 y RNF-RES/RED/ACC/PRIV/STO.
- **Should (primera versión si el prototipo valida capacidad):** REQ-MED-01, REQ-IMG-01, REQ-DAT-01, límites de velocidad y notificaciones extendidas de la cola.
- **Could (siguiente hito):** REQ-APP-03 desktop completo, personalización de grupos, notas en favoritos/listas y analítica local avanzada.
- **Won't now:** elementos de “Fuera de alcance inicial”.

Cambiar prioridad requiere anotación en `DECISIONS.md`, motivo y evaluación del impacto en el usuario.
