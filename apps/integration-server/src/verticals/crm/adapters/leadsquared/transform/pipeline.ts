import type { Pipeline } from '../../../schema/pipeline'

export interface RawLeadsquaredPipeline {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawLeadsquaredPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw,
  }
}
