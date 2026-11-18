import type { Pipeline } from '../../../schema/pipeline'

// Ortto does not have a pipeline model.
export interface RawOrttoPipeline {
  id?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawOrttoPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: '',
    stages: [],
    metadata: raw,
  }
}
