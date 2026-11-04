# Descargar UCLV

Aplicación personal, multiplataforma y tolerante a conexiones inestables para explorar el índice de `visuales.uclv.cu`, organizar favoritos y listas, y descargar archivos reanudables.

## Estado

**Prototipo funcional en desarrollo; todavía no está listo para uso diario.** La PWA instalable tiene shell offline, navegación responsive, búsqueda tolerante a errores, selección jerárquica, agrupación de series, favoritos/listas persistentes, backup JSON con vista previa y restauración atómica, y preview multimedia bajo demanda. El gateway local guarda colas, conserva `.part` y reanuda con Range/If-Range; las pruebas con servidor fixture verifican checksum tras cortes y `ENOSPC` simulado. En Android ya están implementados el adaptador de catálogo y el motor nativo de cola durable, MediaStore, notificaciones y transferencia reanudable. En API 36 se probaron instalación, pausa/persistencia, permisos y programación del trabajo; aún no se completó una transferencia real porque `visuales.uclv.cu` expira por timeout. También están pendientes API 29/34 y un teléfono físico. Android instala desde API 24; el destino público de Descargas requiere API 29 o posterior. La app de escritorio se distribuye como PWA instalable desde Chrome/Edge; no hay instalador nativo. La interfaz pasó revisión visual responsive y un barrido heurístico de contraste/nombres/teclado; falta lector de pantalla y auditoría axe. Revisa el [seguimiento del plan](docs/PLAN.md), la [auditoría del origen](docs/SOURCE_AUDIT.md) y las [decisiones técnicas](docs/DECISIONS.md).

## Documentos vivos

- [`AGENTS.md`](AGENTS.md): instrucciones para agentes de código.
- [`docs/CONTEXT.md`](docs/CONTEXT.md): contexto estable y requisitos del producto.
- [`docs/SOURCE_AUDIT.md`](docs/SOURCE_AUDIT.md): auditoría offline del índice/manifiesto y estado observado del descargador.
- [`docs/design/PREVIEW_CORRECTIONS.md`](docs/design/PREVIEW_CORRECTIONS.md): corrección de cifras para los prototipos.
- [`docs/PLAN.md`](docs/PLAN.md): etapas, entregables y criterios de salida.
- [`capacitor.config.ts`](capacitor.config.ts) y [`android/`](android/): shell Capacitor Android generado; SDK API 36 para compilar el APK.
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md): requisitos con criterios de aceptación.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): capas, clases, servicios y máquina de estados.
- [`docs/FLOWS.md`](docs/FLOWS.md): recorridos completos y errores/recuperación.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md): verificación por campo, requisito y gate.
- [`docs/SYSTEM_REQUIREMENTS.md`](docs/SYSTEM_REQUIREMENTS.md): sistemas, herramientas y prerrequisitos.
- [`docs/INSTALL.md`](docs/INSTALL.md): ejecutar PWA, instalar en Chrome/Edge y estado real del APK.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): decisiones y preguntas abiertas.
- [`docs/PROMPTS.md`](docs/PROMPTS.md): prompts de continuidad para diseño e implementación.
- [`docs/design/preview.html`](docs/design/preview.html): primer boceto responsive, sin conexión al servidor.
- [`docs/design/preview-search.html`](docs/design/preview-search.html): búsqueda con errores, selección por temporada/franquicia y panel de destino/espacio.
- [`.codex/skills/descargar-uclv/SKILL.md`](.codex/skills/descargar-uclv/SKILL.md): guía reutilizable para trabajar en este proyecto.
- [`src/application/catalog-sync.ts`](src/application/catalog-sync.ts): sincronización secuencial con reintento breve y checkpoint durable.
- [`server/gateway.mjs`](server/gateway.mjs): gateway local limitado al origen UCLV.

## Principios

1. El índice, favoritos y colas deben seguir disponibles sin conexión una vez cargados.
2. Ninguna cola se pierde por cerrar la aplicación, reiniciar el equipo o perder la red.
3. Reanudar depende de que el servidor remoto admita solicitudes de rango (`Range`/`206`); se debe comprobar antes de prometerlo.
4. La rapidez se obtiene con concurrencia medida, límites configurables, timeouts cortos y reintentos rápidos acotados, sin saturar el servidor.
5. La interfaz prioriza controles claros, texto legible y estados explícitos para personas de 8 a 80 años.

## Ejecutar la vista previa

`npm run dev` inicia la interfaz y el gateway local. `npm run build` compila la PWA; `npm start` sirve el build junto al gateway. `npm test` ejecuta 74 pruebas y `npm run test:stress` ejecuta 2 pruebas con catálogos sintéticos de 30k/100k elementos. `npm run android:sync` compila la web y sincroniza assets con Capacitor; `npm run android:build:debug` crea el APK debug cuando Android SDK 36, licencias y toolchain están instalados. Las vistas bajo `docs/design/` son prototipos visuales; sus cifras de espacio siguen siendo ejemplos.
