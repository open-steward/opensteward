import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawStreakStage {
  key: string
  name: string
  color?: string
  sortOrder?: number
}

export interface RawStreakPipeline {
  key: string
  name: string
  /** Stages keyed by stage key. */
  stages?: Record<string, RawStreakStage>
  creatorKey?: string
  createdDate?: number
  lastUpdatedDate?: number
  [key: string]: unknown
}

function transformStage(raw: RawStreakStage): PipelineStage {
  return {
    id: raw.key,
    name: raw.name,
    order: raw.sortOrder,
  }
}

export function transformPipeline(raw: RawStreakPipeline): Pipeline {
  const stagesObj = raw.stages ?? {}
  const stages = Object.values(stagesObj)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(transformStage)

  return {
    id: raw.key,
    name: raw.name,
    stages,
    is_active: true,
    created_at: raw.createdDate != null ? new Date(raw.createdDate).toISOString() : undefined,
    updated_at: raw.lastUpdatedDate != null ? new Date(raw.lastUpdatedDate).toISOString() : undefined,
    metadata: raw,
  }
}
