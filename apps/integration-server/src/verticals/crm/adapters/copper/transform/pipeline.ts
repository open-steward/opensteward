import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawCopperPipelineStage {
  id: number
  name: string
  win_probability?: number
  [key: string]: unknown
}

export interface RawCopperPipeline {
  id: number
  name: string
  stages?: RawCopperPipelineStage[]
  [key: string]: unknown
}

function transformStage(raw: RawCopperPipelineStage, index: number): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: index,
    win_probability: raw.win_probability,
  }
}

export function transformPipeline(raw: RawCopperPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: (raw.stages ?? []).map((s, i) => transformStage(s, i)),
    metadata: raw,
  }
}
