import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Raw Loxo deal workflow (pipeline) stage.
 */
export interface RawLoxoPipelineStage {
  id: number | string
  name?: string
  position?: number | null
  win_probability?: number | null
  [key: string]: unknown
}

/**
 * Raw Loxo deal workflow (pipeline) response.
 */
export interface RawLoxoPipeline {
  id: number | string
  name?: string
  stages?: RawLoxoPipelineStage[]
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function transformStage(raw: RawLoxoPipelineStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    order: raw.position != null ? Number(raw.position) : undefined,
    win_probability: raw.win_probability != null ? Number(raw.win_probability) : undefined,
  }
}

export function transformPipeline(raw: RawLoxoPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: (raw.stages ?? []).map(transformStage),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
