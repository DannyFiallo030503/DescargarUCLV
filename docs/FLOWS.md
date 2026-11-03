# Flujos completos de producto

Cada flujo se convierte en al menos un recorrido E2E y casos de error relacionados. Los nombres y cantidades de Fairy Tail son fixtures derivados del manifiesto local anterior.

## FL-01 Primera apertura e índice inicial

1. La app explica que descargará solo el índice, no los videos.
2. El usuario ve el origen y el alcance aproximado antes de iniciar.
3. `CatalogSyncRun` muestra carpetas procesadas, elementos añadidos, errores, pausa y cancelación.
4. Una caída de red conserva cursor y muestra “Pausado por conexión”; al volver, retoma sin duplicar.
5. En éxito se informa fecha/elementos y se abre Explorar; en parcial permite navegar lo indexado.

**Errores a recorrer:** origen no disponible, HTML inesperado, directorio vacío, host redirige fuera del prefijo, entrada malformada, almacenamiento local lleno y cierre durante un lote.

## FL-02 Explorar y entrar/salir de carpetas

1. Inicio muestra áreas frecuentes y estado/fecha del índice.
2. Abrir “Infantiles” → “Animes” → una carpeta de Fairy Tail.
3. Breadcrumb abre cualquier ancestro; atrás vuelve al padre; deep link restaura la ruta si el nodo aún existe.
4. Lista y cuadrícula conservan orden, foco y posición; archivos muestran tipo/tamaño conocido.
5. Offline se navega la copia local y se presenta su antigüedad.

## FL-03 Buscar con errata y corregir

1. Escribir `fary tail`; consulta al índice local con respuesta progresiva y accesible.
2. Mostrar `Fairy Tail` como sugerencia, ruta, grupo encontrado y motivo aproximado.
3. El usuario elige sugerencia, mantiene término original o abre la ruta del resultado.
4. La búsqueda incluye subcarpetas y resultados de franquicia, sin agrupar silenciosamente otros títulos.
5. El enlace de la película Dragon Cry queda visible bajo la franquicia si el grupo la relaciona.

**Casos límite:** consulta vacía, muy corta, solo tildes/signos, typo de una letra, varias coincidencias, ninguna corrección fiable, caracteres Unicode, búsqueda offline e índice obsoleto.

## FL-04 Selección granular y crear lista

1. Marcar casilla de Fairy Tail selecciona 4 temporadas + película (355 entradas según fixture); grupo indica estado completo.
2. Desmarcar una temporada hace padre parcial y reduce bytes/elementos.
3. Marcar “seleccionar todo en carpeta” incluye solo descendientes de esa carpeta.
4. Añadir selección existente a una lista o crear lista nueva; antes de confirmar muestra contador, tamaño conocido, desconocidos y duplicados omitidos.
5. Renombrar/reordenar lista y cerrar app; al volver conserva selección guardada.

**Confirmación de rama grande:** seleccionar carpeta/franquicia con cientos de archivos abre resumen/confirmación, sin un segundo diálogo para selección pequeña.

## FL-05 Destino y espacio

1. En nativo, primera ejecución propone Downloads/Descargas; el selector oficial del SO permite cambiarlo.
2. Guardar elección; al reinicio verificar que el handle/URI siga permitido.
3. Ver nombre/ruta descriptiva, unidad/volumen y hora de medición.
4. Preview de selección suma bytes conocidos; indica cuántos tamaños no existen.
5. Suficiente: habilita iniciar y revalida justo antes.
6. Insuficiente: impide “iniciar completa”, conserva la lista para después, ofrece seleccionar menos/otro destino/liberar espacio.
7. Espacio desconocido (PWA): decirlo sin presentar cuota del navegador como espacio de destino; permitir descarga con estado de riesgo y manejo de ENOSPC.

## FL-06 Encolar, descargar y cerrar

1. Añadir lista → resolver duplicados y validador remoto → checking-space → cola.
2. Ver progreso por bytes guardados, velocidad reciente, ETA solo si hay muestra estable, y estado de otros elementos.
3. Cerrar app o perder red; en Web se comunica dependencia del navegador, en Android/Desktop continúa según runtime.
4. Reabrir horas/días después; reconstruir worker, cargar el parcial y validar Range + ETag.
5. Verificar tamaño; mover a ruta final; marcar completado una sola vez.

## FL-07 Timeout, reintento y servidor cambió

- Interrupción recuperable: error breve, retry según límite, jitter corto, conservar bytes y mostrar próxima acción.
- Error permanente: detener item; no bloquear elementos siguientes; botón de reintento manual.
- Rango inválido/200: no anexar bytes; reinicio informado si está permitido.
- Validador remoto distinto: preservar parcial de diagnóstico o descartarlo solo tras confirmar política; marcar que el archivo remoto cambió.
- Agotamiento de retries: estado visible + manual retry; la lista sigue intacta.

## FL-08 Poco espacio durante una transferencia

Espacio inicial puede cambiar por otras apps. Ante fallo de escritura, cerrar stream, fsync/checkpoint posible, conservar `.part`, marcar `waiting-space`, mostrar requerido/libre estimado y no pasar el archivo a completed. Al liberar espacio, revalidar y retomar.

## FL-09 Favoritos y precarga de miniaturas

Marcar favorito desde resultado/carpeta; el mismo estado aparece en Favoritos y funciona offline. Miniaturas se solicitan solo para carpeta abierta o fijada, primero lo visible; cancelar al cambiar de carpeta; deduplicar peticiones y limpiar caché LRU sin tocar originals.

## FL-10 Backup y restauración

Exportar snapshot versionado → validar integridad; importar primero en modo resumen (nuevos, existentes, conflictos) → confirmar → transacción; rollback si falla. Parciales/archivos descargados no se incluyen salvo referencia explícita.

## FL-11 Instalación y capacidades

- PWA: instalación, modo offline, permisos/selector soportado y descarga best-effort; banner de capacidades reales del navegador.
- APK: destino público Downloads, espacio, interrupciones de proceso, batería/notificación y reanudación tras volver a primer plano.
- Desktop: selector, espacio del volumen, cierre/actualización/reinicio y recuperación.

## FL-12 Accesibilidad y uso sencillo

Todas las acciones alcanzables con teclado; orden de tab sigue el flujo; lector anuncia conteos/estado; checkbox de grupo anuncia “parcial”; mensajes usan lenguaje común, acción y consecuencia; objetivo táctil mínimo 44×44 CSS px donde el layout lo permita.
