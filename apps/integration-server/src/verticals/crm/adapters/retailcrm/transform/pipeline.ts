import type { Pipeline } from '../../../schema/pipeline'

// RetailCRM does not have standard pipelines/funnels.
// This file exists for structural completeness.

export interface RawRetailCrmPipeline {
  id: number | string
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawRetailCrmPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw,
  }
}
