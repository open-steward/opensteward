import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawRdStationStage {
  _id: string
  name?: string
  [key: string]: unknown
}

function transformStage(raw: RawRdStationStage): PipelineStage {
  return {
    id: raw._id,
    name: raw.name ?? '',
  }
}

export function transformPipelineFromStages(stages: RawRdStationStage[]): Pipeline {
  return {
    id: 'default',
    name: 'Default Pipeline',
    is_active: true,
    stages: stages.map(transformStage),
    metadata: { deal_stages: stages },
  }
}
