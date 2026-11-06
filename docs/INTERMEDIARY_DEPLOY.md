# Despliegue del intermediario de catálogo

## Arquitectura

- Vercel continúa sirviendo la interfaz estática en `https://uclv-media.vercel.app`.
- Netlify ejecuta `netlify/functions/catalog.mjs` en São Paulo (`gru`) y solo consulta listados de `https://visuales.uclv.cu`.
- La APK conserva su conexión nativa directa. Las URLs de imagen y video de la web también apuntan directamente a UCLV.
- El navegador consulta el endpoint Netlify desde `VITE_CATALOG_PROXY_URL`; la respuesta permite CORS solo desde el dominio de producción y los orígenes de desarrollo indicados en la función.

## Preparar Netlify

1. Crear un sitio llamado, por ejemplo, `uclv-media-catalog` conectado al repositorio y a la raíz del proyecto.
2. Mantener el comando de build `npm run build`, el directorio publicado `dist` y las funciones en `netlify/functions`; esos valores están en `netlify.toml`.
3. Usar Netlify Pro o Enterprise para seleccionar la región de Functions `gru` (São Paulo). Sin ese plan, no asumir que la función está ejecutándose en esa región.
4. Desplegar solo la función y shell estático. El endpoint previsto es `https://uclv-media-catalog.netlify.app/.netlify/functions/catalog`; confirmar el hostname que Netlify asigne antes de configurarlo.

## Conectar Vercel

Configurar la variable de build `VITE_CATALOG_PROXY_URL` en el proyecto `uclv-media`, para Production y Preview, con el endpoint real de la función Netlify. Luego reconstruir el frontend. La aplicación usa `redirect: "error"` para no seguir redirecciones HTTP del endpoint.

## Gate antes de sincronizar

1. Llamar solo al índice raíz y a una carpeta conocida desde el endpoint Netlify.
2. Confirmar status 200, JSON parseable, entradas correctas y que no se entregue ningún status 3xx.
3. Confirmar que una redirección UCLV a otro dominio se convierte en 502 legible y no se sigue.
4. Abrir la PWA en un teléfono con VPN desactivada y activada; en ambos casos verificar que se puede acceder al endpoint Netlify y leer su respuesta CORS.
5. Si cualquiera de los dos estados de red falla, no iniciar el rastreo completo.

Las verificaciones de producción no se han ejecutado: no hay Netlify CLI ni configuración de cuenta en este entorno, y no se debe activar un plan de pago sin confirmar el acceso/costo de la cuenta.
