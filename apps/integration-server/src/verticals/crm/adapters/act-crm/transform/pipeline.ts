import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawActStage {
  id?: string
  stageId?: string
  name?: string
  stageName?: string
  [key: string]: unknown
}

export interface RawActPipeline {
  id?: string
  pipelineId?: string
  name?: string
  pipelineName?: string
  stages?: RawActStage[]
  stageList?: RawActStage[]
  [key: string]: unknown
}

function transformStage(raw: RawActStage): PipelineStage {
  return {
    id: String(raw.id ?? raw.stageId ?? ''),
    name: raw.stageName ?? raw.name ?? '',
  }
}

export function transformPipeline(raw: RawActPipeline): Pipeline {
  const stages = raw.stages ?? raw.stageList ?? []
  return {
    id: String(raw.id ?? raw.pipelineId ?? ''),
    name: raw.pipelineName ?? raw.name ?? '',
    is_active: true,
    stages: stages.map(transformStage),
    metadata: raw,
  }
}
