import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSalesflareStage {
  id: number
  name: string
  order?: number
  probability?: number
}

export interface RawSalesflarePipeline {
  id: number
  name: string
  stages?: RawSalesflareStage[]
  [key: string]: unknown
}

function transformStage(raw: RawSalesflareStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.order,
    win_probability: raw.probability,
  }
}

export function transformPipeline(raw: RawSalesflarePipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: (raw.stages ?? []).map(transformStage),
    is_active: true,
    metadata: raw,
  }
}
