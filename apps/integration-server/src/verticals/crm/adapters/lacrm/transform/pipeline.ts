import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawLacrmPipelineStatus {
  StatusId: string
  Name?: string
  SortOrder?: number
  [key: string]: unknown
}

export interface RawLacrmPipeline {
  PipelineId: string
  Name?: string
  Statuses?: RawLacrmPipelineStatus[]
  DateCreated?: string
  DateModified?: string
  [key: string]: unknown
}

function transformStage(raw: RawLacrmPipelineStatus, order: number): PipelineStage {
  return {
    id: raw.StatusId,
    name: raw.Name ?? '',
    order: raw.SortOrder ?? order,
  }
}

export function transformPipeline(raw: RawLacrmPipeline): Pipeline {
  return {
    id: raw.PipelineId,
    name: raw.Name ?? '',
    is_active: true,
    stages: (raw.Statuses ?? []).map((s, i) => transformStage(s, i)),
    created_at: raw.DateCreated,
    updated_at: raw.DateModified,
    metadata: raw,
  }
}
