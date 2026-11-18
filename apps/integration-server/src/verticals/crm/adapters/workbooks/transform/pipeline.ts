import type { Pipeline } from '../../../schema/pipeline'

export interface RawWorkbooksPipeline {
  id: string | number
  name?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawWorkbooksPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}
