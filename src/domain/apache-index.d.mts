export interface ParsedApacheEntry {
  id: string
  name: string
  parentPath: string
  relativePath: string
  kind: 'directory' | 'file'
  sizeBytes?: number
  sizeLabel?: string
  sourceUrl: string
}

export function parseApacheIndex(html: string, directoryUrl: string): ParsedApacheEntry[]
