import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawTeamwaveStage {
  id: number
  name: string
  order?: number
  win_probability?: number
}

export interface RawTeamwavePipeline {
  id: number
  name: string
  stages?: RawTeamwaveStage[]
  is_active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function transformStage(raw: RawTeamwaveStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.order,
    win_probability: raw.win_probability,
  }
}

export function transformPipeline(raw: RawTeamwavePipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: (raw.stages ?? []).map(transformStage),
    is_active: raw.is_active ?? true,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}
