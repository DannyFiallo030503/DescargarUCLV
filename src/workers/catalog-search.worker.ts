import { CatalogSearchEngine, type SearchRecord } from '@/domain/search-engine'

type Request =
  | { type: 'replace'; records: SearchRecord[] }
  | { type: 'update'; records: SearchRecord[] }
  | { type: 'search'; requestId: number; query: string }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown) => void
}
const engine = new CatalogSearchEngine()

scope.onmessage = ({ data }) => {
  if (data.type === 'replace') { engine.replace(data.records); return }
  if (data.type === 'update') { engine.update(data.records); return }
  const result = engine.search(data.query)
  scope.postMessage({ requestId: data.requestId, ...result })
}
