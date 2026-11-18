import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawKylasPipelineStage {
  id: number
  name?: string
  winProbability?: number
  [key: string]: unknown
}

export interface RawKylasPipeline {
  id: number
  name?: string
  active?: boolean
  stages?: RawKylasPipelineStage[]
  [key: string]: unknown
}

function transformStage(raw: RawKylasPipelineStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    win_probability: raw.winProbability,
  }
}

export function transformPipeline(raw: RawKylasPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    is_active: raw.active,
    stages: (raw.stages ?? []).map(transformStage),
    metadata: raw,
  }
}
