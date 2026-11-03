import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cu.uclv.descargar',
  appName: 'Descargar UCLV',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
}

export default config
