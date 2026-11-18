import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawZendeskSellStage {
  id: number
  name: string
  position: number
  [key: string]: unknown
}

export interface RawZendeskSellPipeline {
  id: number
  name: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function transformStage(raw: RawZendeskSellStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.position,
  }
}

export function transformPipeline(
  raw: RawZendeskSellPipeline,
  stages?: RawZendeskSellStage[],
): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: (stages ?? []).map(transformStage),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}
