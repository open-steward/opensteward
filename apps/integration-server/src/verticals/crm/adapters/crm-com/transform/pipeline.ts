import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

// CRM.COM does not have a native pipeline concept — stub only
export interface RawCrmComPipelineStage {
  id: string
  name?: string
  probability?: number
  [key: string]: unknown
}

export interface RawCrmComPipeline {
  id: string
  name?: string
  is_active?: boolean
  stages?: RawCrmComPipelineStage[]
  [key: string]: unknown
}

function transformStage(raw: RawCrmComPipelineStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    win_probability: raw.probability,
  }
}

export function transformPipeline(raw: RawCrmComPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    is_active: raw.is_active,
    stages: (raw.stages ?? []).map(transformStage),
    metadata: raw,
  }
}
