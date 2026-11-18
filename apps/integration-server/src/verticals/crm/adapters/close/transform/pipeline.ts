import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawCloseStage {
  id: string
  label: string
  win_probability?: number
  [key: string]: unknown
}

export interface RawClosePipeline {
  id: string
  name: string
  stages?: RawCloseStage[]
  date_created?: string
  date_updated?: string
  [key: string]: unknown
}

function transformStage(raw: RawCloseStage, order: number): PipelineStage {
  return {
    id: raw.id,
    name: raw.label,
    order,
    win_probability: raw.win_probability,
  }
}

export function transformPipeline(raw: RawClosePipeline): Pipeline {
  return {
    id: raw.id,
    name: raw.name,
    is_active: true,
    stages: (raw.stages ?? []).map((s, i) => transformStage(s, i)),
    created_at: raw.date_created,
    updated_at: raw.date_updated,
    metadata: raw,
  }
}
