# Prompts de continuidad

## Descubrimiento del origen

> Inspecciona de forma manual y de bajo impacto `https://visuales.uclv.cu/` para documentar cómo se listan carpetas/archivos y si los archivos admiten HTTP Range. Usa pocas peticiones, no rastrees todo el sitio y no descargues lotes. Registra método, códigos HTTP, headers relevantes, latencia, errores y URLs de ejemplo sin datos sensibles. No infieras compatibilidad por el header de la página inicial. Actualiza `docs/CONTEXT.md`, `docs/DECISIONS.md` y los riesgos de `docs/PLAN.md`.

## Revisión de diseño

> Abre `docs/design/preview.html` y `docs/design/preview-search.html`. Revisa móvil estrecho, escritorio ancho y distintos niveles de alfabetización digital. Comprueba que búsqueda tolerante a errores, sugerencias, navegación de carpetas, selección de serie/temporada/archivo y destino/espacio se entiendan. No conviertas todavía el boceto en interfaz funcional; primero actualiza los bocetos con los cambios acordados.

## Implementación

> Antes de modificar código, lee `AGENTS.md`, `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/PLAN.md` y `.codex/skills/descargar-uclv/SKILL.md`. Implementa solo la etapa aprobada, conserva compatibilidad PWA y explica qué capacidades requieren runtime nativo. Actualiza decisiones y plan al descubrir hechos nuevos. Para validaciones, usa fixtures locales; no hagas rastreo ni cargas masivas contra el origen.
