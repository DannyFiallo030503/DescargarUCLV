import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cu.uclv.descargar',
  appName: 'UCLV Media',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
}

export default config
