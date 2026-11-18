import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

interface RawHLStage {
  id: string
  name?: string
  position?: number
  [key: string]: unknown
}

export interface RawHighLevelPipeline {
  id: string
  name?: string
  stages?: RawHLStage[]
  [key: string]: unknown
}

function transformStage(raw: RawHLStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    order: raw.position,
  }
}

export function transformPipeline(raw: RawHighLevelPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: (raw.stages ?? []).map(transformStage),
    metadata: raw,
  }
}
