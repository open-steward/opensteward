import type { Pipeline } from '../../../schema/pipeline'

// SuiteCRM doesn't have a native pipeline concept in v8 REST API
// Return empty array for unsupported resource

export interface RawSuiteCrmPipeline {
  id?: string
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawSuiteCrmPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    is_active: true,
    stages: [],
    metadata: raw,
  }
}
