import type { Pipeline } from '../../../schema/pipeline'

export interface RawHoldedPipeline {
  id: string
  name?: string
  stages?: Array<{ id: string; name?: string }>
  [key: string]: unknown
}

export function transformPipeline(raw: RawHoldedPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: raw.stages?.map((s, i) => ({
      id: String(s.id),
      name: s.name ?? '',
      order: i,
    })),
    metadata: raw,
  }
}
