import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawCreatioStage {
  Id: string
  Name: string
  Number?: number
  [key: string]: unknown
}

function transformStage(raw: RawCreatioStage): PipelineStage {
  return {
    id: String(raw.Id),
    name: raw.Name,
    order: raw.Number,
  }
}

export function transformPipeline(stages: RawCreatioStage[]): Pipeline {
  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages: stages.map(transformStage),
    metadata: { stages },
  }
}
