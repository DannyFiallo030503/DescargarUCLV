# Instrucciones del proyecto

- Lee `docs/CONTEXT.md` y `docs/PLAN.md` antes de cambios de producto. Mantén `docs/DECISIONS.md` al día cuando se elija o descarte una arquitectura.
- Antes de implementar una pantalla nueva, consulta `docs/design/preview.html` y conserva el requisito de aprobar la dirección visual antes de construir la interfaz funcional.
- Para el flujo completo de trabajo de este producto, lee `.codex/skills/descargar-uclv/SKILL.md`.
- Prioriza accesibilidad, español claro, diseño responsive, rendimiento en redes lentas y persistencia local.
- No asumas que `visuales.uclv.cu` expone una API, CORS, un sitemap, listados estáticos o soporte HTTP Range. Descubre y documenta su comportamiento antes de elegir el adaptador.
- No hagas peticiones de rastreo masivo ni descargas de prueba al servidor real durante el descubrimiento. Respeta sus límites y deja el ritmo configurable.
- Para validaciones de proyectos con Aspire, cumple la sección de Aspire de las instrucciones globales del usuario.
- Las colas deben ser recuperables y seguras ante reinicios. Registra estados, bytes confirmados, ETag/Last-Modified y ruta parcial cuando aplique.
- No afirmes que una PWA descarga en segundo plano con la app cerrada: depende del navegador y del sistema operativo. Separa explícitamente capacidades web y nativas.
- Usa `rtk` como prefijo en comandos de terminal para obtener salidas concisas.
