import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawInsightlyStage {
  STAGE_ID: number
  STAGE_NAME: string
  STAGE_ORDER?: number
  WIN_PROBABILITY?: number
}

export interface RawInsightlyPipeline {
  PIPELINE_ID: number
  PIPELINE_NAME: string
  STAGES?: RawInsightlyStage[]
  [key: string]: unknown
}

function transformStage(raw: RawInsightlyStage): PipelineStage {
  return {
    id: String(raw.STAGE_ID),
    name: raw.STAGE_NAME,
    order: raw.STAGE_ORDER,
    win_probability: raw.WIN_PROBABILITY,
  }
}

export function transformPipeline(raw: RawInsightlyPipeline): Pipeline {
  return {
    id: String(raw.PIPELINE_ID),
    name: raw.PIPELINE_NAME,
    stages: (raw.STAGES ?? []).map(transformStage),
    metadata: raw,
  }
}
