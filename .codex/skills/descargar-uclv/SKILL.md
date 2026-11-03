---
name: descargar-uclv
description: Diseñar, implementar y mantener Descargar UCLV, su catálogo offline, listas y descargas reanudables desde visuales.uclv.cu.
---

# Descargar UCLV

Lee `docs/CONTEXT.md`, `docs/PLAN.md` y `docs/DECISIONS.md` antes de trabajo de producto. Usa `AGENTS.md` para las restricciones del proyecto.

## Enfoque

- Trata el origen remoto como desconocido hasta medirlo. No presupongas HTML estático, API, CORS, Range, ETag ni permisos de rastreo.
- Conserva un catálogo local consultable sin red; sincroniza por lotes y con checkpoint para que una caída no obligue a empezar desde cero.
- Persiste la cola y cada checkpoint de archivo. Reanuda solo si el servidor valida el offset; controla ETag/Last-Modified y responde correctamente si el remoto cambió.
- Usa timeouts de inactividad y reintentos breves, acotados, con jitter. Permite pausar y volver a intentar manualmente. No aumentes concurrencia sin evidencia de mejora ni satures el servidor.
- Separa interfaz, política de catálogo/cola y adaptadores web/Android/escritorio. No anuncies trabajo en segundo plano duradero para navegador puro.
- Carga previews y miniaturas bajo demanda, con límites de caché y sin hacer que bloqueen la navegación.
- Mantén la búsqueda local tolerante a errores y ofrece corrección, contexto de ruta y resultados exactos alternativos. Permite seleccionar una serie, temporada/carpeta o archivos individuales e informa el alcance de selecciones jerárquicas.
- Usa Downloads/Descargas como destino inicial, pero respeta permisos por plataforma. Antes de iniciar una lista, calcula bytes conocidos, consulta el espacio del destino si el runtime lo permite y advierte/bloquea según el caso. Nunca presentes la cuota web como espacio libre del volumen.
- Diseña controles legibles y accesibles para personas de diferentes edades y experiencia digital; prueba móvil y escritorio.

## Descubrimiento y validación

- Para el sitio real, empieza con observación manual y pocas solicitudes de solo lectura. Nunca rastrees ni descargues masivamente durante un ciclo de desarrollo.
- Desarrolla contra fixtures locales y casos de latencia, interrupción, 200/206, cambio de ETag, disco lleno y reinicio.
- Si hay un AppHost local de Aspire, inspecciónalo y valida mediante sus recursos existentes según `AGENTS.md`; nunca levantes dependencias paralelas.
- Al cambiar una decisión técnica, anota evidencia y consecuencias en `docs/DECISIONS.md`.
