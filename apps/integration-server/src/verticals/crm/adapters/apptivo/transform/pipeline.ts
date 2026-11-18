import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawApptivoStage {
  stageId?: string
  id?: string
  stageName?: string
  name?: string
  [key: string]: unknown
}

export interface RawApptivoPipeline {
  pipelineId?: string
  id?: string
  pipelineName?: string
  name?: string
  stageList?: RawApptivoStage[]
  [key: string]: unknown
}

function transformStage(raw: RawApptivoStage): PipelineStage {
  return {
    id: String(raw.stageId ?? raw.id ?? ''),
    name: raw.stageName ?? raw.name ?? '',
  }
}

export function transformPipeline(raw: RawApptivoPipeline): Pipeline {
  return {
    id: String(raw.pipelineId ?? raw.id ?? ''),
    name: raw.pipelineName ?? raw.name ?? '',
    is_active: true,
    stages: (raw.stageList ?? []).map(transformStage),
    metadata: raw,
  }
}
