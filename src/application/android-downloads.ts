import { registerPlugin } from '@capacitor/core'

export interface AndroidDestinationInfo {
  supported: boolean
  destination: string
  platformApi: number
  freeBytes?: number | null
  totalBytes?: number | null
  spaceError?: string
}

interface AndroidDownloadsPlugin {
  getDestinationInfo(): Promise<AndroidDestinationInfo>
}

export const androidDownloads = registerPlugin<AndroidDownloadsPlugin>('AndroidDownloads')
