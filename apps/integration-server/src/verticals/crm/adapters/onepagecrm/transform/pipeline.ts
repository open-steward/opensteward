import type { Pipeline } from '../../../schema/pipeline'

export interface RawOnePageCrmStatus {
  id?: string | number
  status?: string
  text?: string
  color?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawOnePageCrmStatus): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.text ?? raw.status ?? '',
    metadata: raw,
  }
}
