import type { Pipeline } from '../../../schema/pipeline'

// Bexio has no native pipeline concept; return empty list
export interface RawBexioPipeline {
  [key: string]: unknown
}

export function transformPipeline(raw: RawBexioPipeline): Pipeline {
  return {
    id: '',
    name: '',
    is_active: true,
    stages: [],
    metadata: raw,
  }
}
