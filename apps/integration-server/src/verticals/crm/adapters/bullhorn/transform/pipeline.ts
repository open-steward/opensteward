import type { Pipeline } from '../../../schema/pipeline'

// Bullhorn does not have a native pipeline concept
// Pipelines are not supported — list returns empty
export interface RawBullhornPipeline {
  id: number | string
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawBullhornPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: [],
    metadata: raw,
  }
}
