import type { Pipeline } from '../../../schema/pipeline'

// Qiscus does not have a native pipeline entity
export interface RawQiscusPipeline {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawQiscusPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: [],
    metadata: raw,
  }
}
