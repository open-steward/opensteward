import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

// Wakeupsales Pipeline entity
// TODO: verify field names against https://apidocs.wakeupsales.com/
export interface RawWakeupsalesPipeline {
  id?: string | number
  name?: string
  is_active?: boolean | number
  stages?: RawWakeupsalesPipelineStage[]
  [key: string]: unknown
}

export interface RawWakeupsalesPipelineStage {
  id?: string | number
  name?: string
  probability?: number
  [key: string]: unknown
}

function transformStage(raw: RawWakeupsalesPipelineStage): PipelineStage {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    win_probability: raw.probability,
  }
}

export function transformPipeline(raw: RawWakeupsalesPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    is_active: raw.is_active === true || raw.is_active === 1,
    stages: Array.isArray(raw.stages) ? raw.stages.map(transformStage) : [],
    metadata: raw,
  }
}
