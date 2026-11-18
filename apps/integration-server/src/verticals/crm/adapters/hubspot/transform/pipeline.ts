import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawHubSpotPipelineStage {
  id: string
  label: string
  displayOrder: number
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawHubSpotPipeline {
  id: string
  label: string
  displayOrder?: number
  stages?: RawHubSpotPipelineStage[]
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

function transformStage(raw: RawHubSpotPipelineStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.label,
    order: raw.displayOrder,
  }
}

export function transformPipeline(raw: RawHubSpotPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.label,
    stages: (raw.stages ?? []).map(transformStage),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}
