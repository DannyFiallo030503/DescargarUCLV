import { registerPlugin } from '@capacitor/core'

export interface AndroidDestinationInfo {
  supported: boolean
  destination: string
  platformApi: number
  freeBytes?: number | null
  totalBytes?: number | null
  spaceError?: string
}

export interface AndroidDownloadItem {
  id: string
  name: string
  path: string
  sizeBytes?: number
}

export interface AndroidDownloadSnapshot {
  destination: string
  freeBytes: number
  jobs: Array<{
    id: string
    destination: string
    destinationFreeBytes?: number
    status: string
    updatedAt: number
    items: Array<AndroidDownloadItem & { bytesDone: number; status: string; error?: string; retryAttempts?: number; nextAttemptAt?: number }>
  }>
  added?: number
}

interface AndroidDownloadsPlugin {
  getDestinationInfo(): Promise<AndroidDestinationInfo>
  getSnapshot(): Promise<AndroidDownloadSnapshot>
  enqueue(options: { items: AndroidDownloadItem[] }): Promise<AndroidDownloadSnapshot>
  control(options: { action: 'pause' | 'resume' | 'remove' }): Promise<AndroidDownloadSnapshot>
}

export const androidDownloads = registerPlugin<AndroidDownloadsPlugin>('AndroidDownloads')
