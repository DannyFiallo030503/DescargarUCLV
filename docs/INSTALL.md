# Instalar y ejecutar Descargar UCLV

## Web y escritorio (PWA)

1. Instala Node.js 22 o superior y clona/abre este proyecto en el equipo.
2. Ejecuta `npm install`, `npm run build` y `npm start`.
3. Abre `http://127.0.0.1:4179/` en Chrome o Edge. Para instalarlo como aplicación de escritorio, usa el menú del navegador **Guardar y compartir → Instalar página como aplicación** (el texto exacto puede variar según versión).
4. Mantén el proceso local activo para sincronizar el sitio, previsualizar y descargar. El shell de la PWA puede abrirse offline, pero el navegador puede suspender transferencias largas si cierras la app.

El índice, favoritos y listas viven en el almacenamiento local del perfil del navegador. Exporta copias desde **Ajustes → Copia de seguridad** antes de borrar datos del navegador o migrar de perfil.

## Android

El shell Capacitor está generado. Instala Android SDK 36, build-tools, platform-tools y JDK 21; configura las rutas locales mediante variables de entorno. `android/local.properties` es específico del equipo y está ignorado por Git:

```sh
JAVA_HOME="/path/to/jdk-21" \
ANDROID_HOME="/path/to/Android/Sdk" \
ANDROID_SDK_ROOT="/path/to/Android/Sdk" \
GRADLE_USER_HOME="/path/to/gradle-cache" \
npm run android:build:debug
```

La compilación debug genera `android/app/build/outputs/apk/debug/app-debug.apk` (`cu.uclv.descargar`; min SDK 24, target SDK 36; firma debug v2). Se probó el shell con un emulador Android virtual; aún faltan pruebas con un dispositivo físico.

**El APK de este prototipo todavía no puede sincronizar o descargar:** falta el adaptador de API Android y el worker nativo con destino Downloads, cola durable, reanudación y notificación foreground. Es solo un artefacto debug para validar el shell; no instalarlo como producto hasta cerrar G7/G8/G11 y probarlo en un dispositivo real.

## Datos incluidos en la copia JSON

Se exportan catálogo, favoritos, listas y checkpoint de catálogo. No se exportan descargas completadas, `.part`, cola del gateway, ruta de destino ni credenciales.
