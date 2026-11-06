# Auditoría del origen y del índice

Fecha: 2026-11-02 · Métodos: inspección acotada de respuestas HTTP y revisión de un snapshot histórico de directorios. No equivale a una enumeración completa ni prueba permisos de rastreo.

## 1. Snapshot histórico

El snapshot revisado contiene alrededor de 30 mil enlaces únicos, todos a directorios; no incluye el inventario de archivos. Sirve como referencia de jerarquía, no como índice buscable de medios. Algunos enlaces tenían HTTP y separadores no canónicos; no deben reutilizarse sin validación.

## 2. Sondeo HTTP de bajo volumen

| Operación | Resultado observado | Implicación |
|---|---|---|
| `HEAD /` | 200, Apache, HTML | El origen expone un autoindex. |
| `GET /` con rango pequeño | 206 | El índice raíz era corto; un listado de carpeta puede ignorar `Range`. |
| `GET` de carpetas de prueba | 200, HTML de tabla Apache | El parser debe manejar tabla y `<pre>`, entidades, rutas codificadas y tamaños. |
| `GET /` (2026-11-05) | 200, Apache 2.4.57, autoindex `<pre>`; 2.147 bytes, 14 carpetas y 5 archivos en la raíz | El parser inicial solo procesaba tablas `<tr>/<td>` y devolvía cero elementos para esta respuesta. Se añadió soporte `<pre>` y se validó con el cuerpo capturado. |
| `HEAD` de un archivo de prueba | 200, MIME y tamaño | Algunas respuestas exponen ETag y Last-Modified. |
| `GET` de un byte | 206 con `Content-Range` | El origen observado admite rangos para archivos. |
| Rango fuera de límite | 416 | El cliente debe validar tamaño y offset antes de anexar. |
| Origen web candidato | No se observó `Access-Control-Allow-Origin` | El acceso directo desde otro origen no está demostrado; mantener gateway/adaptador hasta verificarlo en navegador. |
| `HEAD /listado.html` (2026-11-06) | 200, `text/html`, 4,652,220 bytes; `Last-Modified: 2026-11-06 08:03:37 GMT`, ETag presente | El prefijo HTML declara `Made by 'tree'` y `tree v1.7.0`; se trata de un archivo generado, no de un endpoint dinámico confirmado. La descarga de lectura se detuvo tras 20 s y no se usó para inferir integridad del cuerpo completo. |
| `HEAD /listado.txt` (2026-11-06) | 200, `text/plain`, 1,507,346 bytes; `Last-Modified: 2026-11-06 08:03:31 GMT`, ETag presente | Una lectura Range de 1 KiB respondió 206 y mostró el mismo árbol de directorios. Los tiempos de modificación, separados por seis segundos, sugieren generación conjunta; no demuestran frecuencia de actualización ni inclusión de archivos, tamaños o fechas. |
| Proxy compartido `proxy.cors.dev` → `GET /` (2026-11-06) | El proxy devolvió CORS y HTTP 504 `upstream_timeout` a los 30 s; no hubo redirección al cliente | El servicio fue accesible desde esta ruta, pero no alcanzó UCLV dentro de su plazo. Sus límites publicados (6 MiB/30 s) y este timeout no lo hacen candidato verificado para el catálogo. |
| AllOrigins → `GET /` (2026-11-06) | HTTP 522 de Cloudflare | El servicio compartido no quedó disponible desde esta ruta. |
| CORS.SH → `GET /` (2026-11-06) | Error DNS `Could not resolve host: proxy.cors.sh` | No se pudo verificar su disponibilidad ni acceso al origen. Estas comprobaciones no determinan accesibilidad desde el teléfono con VPN activada/desactivada. |

Son mediciones puntuales, no una prueba de estabilidad. No se probaron cambios de archivo con `If-Range`, múltiples rangos, límites de rastreo ni carga sostenida. No asumir una API, sitemap o permiso de rastreo masivo.

## 3. Conclusiones para el producto

1. Enumerar archivos dentro de carpetas con checkpoint; los árboles de directorios existentes no bastan para buscar medios.
2. Contabilizar carpetas y archivos por separado. El tamaño debe ser opcional cuando el listado no lo provea.
3. Canonicalizar URLs y rutas codificadas sin escapar del host permitido.
4. Para reanudar, contrastar `Content-Range`, longitud y ETag/Last-Modified antes de anexar.
5. La ausencia observada de CORS mantiene pendiente la elección de adaptador para cada plataforma.

## 4. Próximos pasos seguros

- Ampliar fixtures locales para tabla Apache, `<pre>`, rutas codificadas, respuesta truncada, redirección fuera del origen, cambio de ETag y disco lleno.
- Confirmar CORS desde Chrome con el origen candidato antes de habilitar peticiones directas.
- Mantener sincronización de baja concurrencia, pausa manual, tiempos límite y reintentos acotados.
