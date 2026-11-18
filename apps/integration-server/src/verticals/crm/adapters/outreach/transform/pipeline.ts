import type { Pipeline } from '../../../schema/pipeline'
import type { JsonApiResource } from '../client'

export interface RawOutreachPipelineAttributes {
  name?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type RawOutreachPipeline = JsonApiResource<RawOutreachPipelineAttributes>

/**
 * Outreach has no pipeline API. This transform is a placeholder so the
 * module shape is consistent; it is never called in practice (501 returned).
 */
export function transformPipeline(raw: RawOutreachPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.attributes.name ?? '',
    stages: [],
    created_at: raw.attributes.createdAt,
    updated_at: raw.attributes.updatedAt,
    metadata: raw,
  }
}
