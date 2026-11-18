import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawFreshsalesStage {
  id: number
  name: string
  position?: number
  [key: string]: unknown
}

export interface RawFreshsalesPipeline {
  id: number
  name: string
  deal_stages?: RawFreshsalesStage[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function transformStage(raw: RawFreshsalesStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.position,
  }
}

export function transformPipeline(raw: RawFreshsalesPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: (raw.deal_stages ?? []).map(transformStage),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}
