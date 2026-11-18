import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawBrevoPipelineStage {
  id?: string
  name?: string
  [key: string]: unknown
}

// GET /crm/pipeline/details/all returns a bare array of these. The pipeline's
// own id and label are `pipeline` / `pipeline_name` — there is no `id` or
// top-level `name` field on the pipeline object (those belong to each stage).
export interface RawBrevoPipeline {
  pipeline?: string
  pipeline_name?: string
  stages?: RawBrevoPipelineStage[]
  [key: string]: unknown
}

function transformStage(raw: RawBrevoPipelineStage): PipelineStage {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
  }
}

export function transformPipeline(raw: RawBrevoPipeline): Pipeline {
  return {
    id: String(raw.pipeline ?? ''),
    name: raw.pipeline_name ?? '',
    is_active: true,
    stages: raw.stages?.map(transformStage),
    metadata: raw,
  }
}
