# Contexto del producto

## Necesidad

Crear una aplicación personal y no comercial para descubrir y descargar contenido alojado en `https://visuales.uclv.cu/`. Debe facilitar buscar, navegar carpetas, descargar un elemento o una lista, retomar trabajo después de días, guardar favoritos/listas y previsualizar imágenes y videos. La carga inicial debería construir un índice local reutilizable para evitar consultar el servidor en cada visita. Las miniaturas se cargarán de forma diferida y se podrán precargar en segundo plano para carpetas abiertas o fijadas.

Existe un descargador personal independiente fuera de este proyecto. No forma parte del repositorio y no se utiliza como fuente de datos ni se modifica desde esta aplicación.

## Hallazgo de auditoría importante

El snapshot `Directory Tree` del 28-10-2026 tiene 30,059 hrefs, todos de directorios, y omite nombres/tamaños de archivos. El árbol de texto tiene 30,058 nodos de carpetas y 16 categorías raíz. No equivale a un inventario de 30 mil archivos. Se corrigieron las cifras ilustrativas de los prototipos en [`docs/design/PREVIEW_CORRECTIONS.md`](design/PREVIEW_CORRECTIONS.md). La app inicial usa una muestra explícitamente marcada hasta que el usuario sincronice el origen.

## Personas y experiencia

La interfaz debe servir a personas de 8 a 80 años, con alfabetización digital variable y pantallas pequeñas o grandes:

- navegación evidente y lenguaje cotidiano;
- controles grandes con icono y etiqueta, objetivos táctiles cómodos;
- búsqueda visible, migas de pan y acciones principales cerca del contenido;
- contraste alto, foco visible, soporte teclado/lector y respeto a movimiento reducido;
- estados vacíos, errores, progreso, pausa y reintento explicados sin jerga;
- permitir ocultar detalles técnicos, pero mostrar por qué una tarea espera o falla;
- responder a móvil estrecho, tablet, portátil y escritorio ancho.

## Requisitos funcionales

1. Inspeccionar el sitio y acordar una estrategia de lectura compatible con su estructura real y términos de uso.
2. Crear/actualizar un índice local del contenido: jerarquía, rutas, tamaños/fechas cuando existan, tipo y metadatos de sincronización.
3. Buscar localmente sin petición remota por cada consulta; sincronizar por demanda o de forma controlada.
4. Buscar en el índice local con tolerancia a errores de ortografía, tildes, transposición de letras y espacios; sugerir corrección (“¿Quizás quisiste decir...?”), mostrar la ruta y permitir conservar la consulta original.
5. Navegar todas las carpetas/subcarpetas con breadcrumbs y volver al padre. Una serie puede estar fragmentada entre varias carpetas o temporadas.
6. Seleccionar la serie completa, varias temporadas/carpetas o archivos individuales con controles jerárquicos que expliquen cuántos descendientes quedan seleccionados.
7. Crear, renombrar y mantener listas de descarga; añadir carpetas/contenido; ordenar/reordenar; conservarlas al reiniciar y retomar días después.
8. Pausar, continuar, priorizar y cancelar elementos, con límites de concurrencia.
9. Favoritos persistentes y notas o colecciones simples si se justifican.
10. Vista previa de imágenes/video cuando el servidor lo permita, con carga diferida y miniaturas oportunistas.
11. Mostrar progreso por elemento y cola, bytes confirmados, velocidad reciente, último error y próxima acción.
12. Configurar carpeta de destino, comenzando en `Downloads/Descargas`; mostrar el destino antes de descargar y permitir cambiarlo.
13. Mostrar espacio libre y bytes requeridos por la selección; advertir o bloquear listas que no quepan cuando se pueda medir de forma fiable.
14. Ajustes de red: concurrencia conservadora por defecto, límites de velocidad opcionales, timeout por inactividad y política de reintento rápida y acotada.
15. Importar/exportar respaldo del catálogo personal, favoritos y listas.
16. Instalar como PWA; generar APK Android. Investigar empaquetado de escritorio como objetivo adicional.

## Requisitos no funcionales

- **Red mala e intermitente:** timeouts por inactividad; detectar enlaces caídos pronto; reintentos con demora corta, aleatoria y acotada; no hacer ciclos infinitos ni martillear el origen.
- **Reanudación real:** conservar temporal y offset verificado. Reanudar solo con `Range`/`206` y validadores del recurso (`ETag` o `Last-Modified`); si no hay soporte, reiniciar de forma explícita y segura.
- **Índice local:** almacenamiento durable, actualización atómica o por lotes y recuperación de interrupciones. Evitar materializar en memoria todo un índice grande.
- **Privacidad/simplicidad:** sin cuentas ni telemetría comercial por defecto; datos personales locales.
- **Portabilidad:** separar UI, catálogo, política de cola y adaptadores de plataforma.
- **Accesibilidad:** WCAG 2.2 AA como objetivo de diseño a validar durante implementación.
- **Destino y espacio:** preferir la carpeta estándar Descargas del sistema. Si la plataforma no permite conocer el espacio exacto o fijar esa ruta sin acción del usuario, explicar la limitación y usar el selector nativo.

## Restricción de plataforma clave

La PWA sirve para interfaz instalada, índice/cache y tareas mientras la app está abierta. Service workers pueden ser detenidos por el navegador y Background Sync no ofrece una garantía de ejecución prolongada. Para transferencias que deban continuar durante horas o con la app cerrada, el APK/cliente de escritorio necesitará una tarea nativa duradera o un motor local residente. No prometer esa capacidad para el navegador puro.

Fuentes actuales consultadas (02-11-2026):

- [Capacitor: web-native runtime y plataformas](https://capacitorjs.com/docs)
- [Capacitor: añadir plataformas nativas a una app web](https://capacitorjs.com/docs/getting-started)
- [MDN: Background Synchronization API, disponibilidad limitada](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [MDN: operación offline y límites de tareas en segundo plano](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [MDN: showDirectoryPicker, permisos y disponibilidad](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [Android: archivos compartidos y MediaStore.Downloads](https://developer.android.com/training/data-storage/shared/media?hl=en)
- [Android: restricciones de SAF en Android 11+](https://developer.android.com/about/versions/11/privacy/storage)

## Destino de descargas y medición de espacio

La preferencia inicial es `Downloads/Descargas` en cada dispositivo, con opción para cambiarla. En web, el selector de carpeta requiere una acción explícita del usuario y no está disponible en todos los navegadores. `navigator.storage.estimate()` informa sobre cuota del almacenamiento web, no el espacio libre del volumen Downloads del sistema. Cuando no haya medición real, mostrar “espacio del dispositivo no disponible” en vez de presentar una cifra engañosa. En Android nativo, los archivos propios pueden guardarse en la colección pública `MediaStore.Downloads`; desde Android 11 el selector SAF no puede conceder acceso a la carpeta raíz de Downloads, aunque MediaStore permite gestionar las entradas creadas por la app. En escritorio nativo puede consultarse el espacio del volumen de la carpeta autorizada. Revalidar espacio antes de una lista grande y al cambiar destino.

## Estado del descubrimiento del origen

- Sondeo HTTP manual acotado (2026-11-02): Apache 2.4.57; `HEAD /` y listados conocidos respondieron 200, sin redirección. `GET /` mostró autoindex HTML; dos carpetas conocidas también devolvieron listados Apache con nombres/tamaños. La ruta con espacios y paréntesis codificados respondió correctamente.
- Un MP4 respondió `HEAD 200`, `video/mp4`, `Content-Length: 111193168`, `Accept-Ranges: bytes`, ETag y Last-Modified. `Range: bytes=0-0` respondió 206 con `Content-Range` exacto y longitud 1; un rango desde el byte final respondió 416. Una muestra del listado de carpeta ignoró Range y devolvió 200 chunked, por lo que el parser debe leer el documento completo y el crawler debe limitar concurrencia/ritmo por su tamaño real.
- No apareció `Access-Control-Allow-Origin` en respuestas de prueba con `Origin: https://localhost`; `curl` no sustituye una comprobación de política CORS en navegador. El acceso web cross-origin no debe asumirse. La implementación usará un gateway local para la experiencia web y transporte nativo para APK/escritorio, salvo que una prueba futura demuestre que el origen ya permite CORS.
- Las latencias medidas (~0.05–0.18 s) son muestras únicas y no describen la conexión variable. No se comprobaron previews de imagen/video, `If-Range`, cambio de ETag, 304, controles de reproducción ni permiso/condiciones de rastreo a gran escala.
- El descargador existente usa parser de autoíndice Apache, crawl restringido a prefijos, bloques Range de 64 KiB y hasta cuatro intentos con timeout 25 s/pausa 2 s. No manda `If-Range`: el nuevo adaptador debe comparar validador y tamaño antes de anexar un parcial para evitar mezclar versiones. No tocar ni lanzar el descargador viejo.
- Para detalles y headers observados, ver [`SOURCE_AUDIT.md`](SOURCE_AUDIT.md). El conteo del árbol histórico sigue siendo solo directorios y sus categorías de mockup deben reemplazarse por los nombres reales del sitio.
