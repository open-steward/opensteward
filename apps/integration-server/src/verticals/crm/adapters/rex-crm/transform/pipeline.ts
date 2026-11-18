import type { Pipeline } from '../../../schema/pipeline'

// Rex CRM uses property listings — pipelines are not applicable.
export interface RawRexPipeline {
  id?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawRexPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: '',
    stages: [],
    metadata: raw,
  }
}
