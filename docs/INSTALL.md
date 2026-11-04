# UCLV Media — instalación y ejecución

## Web y escritorio (PWA)

1. Instala Node.js 22 o superior y clona/abre este proyecto en el equipo.
2. Ejecuta `npm install`, `npm run build` y `npm start`.
3. Abre `http://127.0.0.1:4179/` en Chrome o Edge. Para instalarlo como aplicación de escritorio, usa el menú del navegador **Guardar y compartir → Instalar página como aplicación** (el texto exacto puede variar según versión).
4. Mantén el proceso local activo para sincronizar el sitio, previsualizar y descargar. El shell de la PWA puede abrirse offline después de la primera carga. Cerrar la ventana PWA no detiene una transferencia del gateway mientras `npm start` siga ejecutándose; si se detiene el gateway o el equipo, la cola y el parcial se conservan para reanudar al volver a iniciarlo.

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

La compilación debug genera `android/app/build/outputs/apk/debug/app-debug.apk` y la copia lista para instalar `artifacts/UCLV-Media-Android-debug.apk` (`cu.uclv.descargar`; min SDK 24, target SDK 36; firma debug v2). La etiqueta instalada es “UCLV Media”. La copia se valida con `aapt` y SHA-256; el dispositivo físico no está conectado, por lo que falta la instalación en tu teléfono.

El APK incluye el adaptador Android de catálogo y el motor nativo de descargas: cola durable, parciales reanudables, destino `Descargas/Descargar UCLV`, notificaciones y trabajo en segundo plano. El destino público usa MediaStore desde API 29; API 34 o posterior programa trabajos iniciados por el usuario y API 29–33 usa el servicio foreground. En API 36 se validaron instalación, permiso de notificaciones, pausa y persistencia tras cierre forzado, programación UIDT y retirada de la cola. La petición real a `visuales.uclv.cu` expiró, así que no se obtuvo un archivo final ni se verificó publicación MediaStore/Rango contra ese servidor. Las pruebas API 29/34 y teléfono físico siguen pendientes. El APK es debug y no constituye un release firmado para distribución.

## Despliegue estático de demostración en Vercel

Vercel puede publicar el build de Vite y el shell PWA con el proyecto `uclv-media`. Ese host solo entrega archivos estáticos: no ejecuta el gateway local Node que atiende `/api/list`, `/api/file` y `/api/downloads`. Por eso permite revisar la interfaz y probar la instalación/cache offline, pero no sincronizar `visuales.uclv.cu`, previsualizar archivos a través del gateway ni hacer transferencias desde la URL pública. Para uso completo, ejecutar la app con su gateway local o usar el APK Android. No se envían los archivos personales a Vercel.

Vercel debe compilar con `npm run build` y publicar `dist/`; `/sw.js` se sirve sin caché para que el navegador pueda detectar actualizaciones.

## Datos incluidos en la copia JSON

Se exportan catálogo, favoritos, listas y checkpoint de catálogo. No se exportan descargas completadas, `.part`, cola del gateway, ruta de destino ni credenciales.
