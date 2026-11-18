import type { Pipeline } from '../../../schema/pipeline'

// NetSuite CRM pipelines — stub
export interface RawNetsuitePipeline {
  id: string | number
  [key: string]: unknown
}

export function transformPipeline(raw: RawNetsuitePipeline): Pipeline {
  return {
    id: String(raw.id),
    name: '',
    stages: [],
    metadata: raw,
  }
}
