import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawWebcrmPipelineStage {
  PipelineStageId?: number
  PipelineStageName?: string
  PipelineStageWinProbability?: number
  [key: string]: unknown
}

export interface RawWebcrmPipeline {
  PipelineId?: number
  PipelineName?: string
  Stages?: RawWebcrmPipelineStage[]
  [key: string]: unknown
}

function transformStage(raw: RawWebcrmPipelineStage): PipelineStage {
  return {
    id: String(raw.PipelineStageId ?? ''),
    name: raw.PipelineStageName ?? '',
    win_probability: raw.PipelineStageWinProbability,
  }
}

export function transformPipeline(raw: RawWebcrmPipeline): Pipeline {
  return {
    id: String(raw.PipelineId ?? ''),
    name: raw.PipelineName ?? '',
    is_active: true,
    stages: (raw.Stages ?? []).map(transformStage),
    metadata: raw,
  }
}
