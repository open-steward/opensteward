import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * Mazrica represents pipelines as "deal types" (deal_setting/deal_types).
 * Each deal type has phases that correspond to pipeline stages.
 */
export interface RawMazricaPhase {
  id?: number
  name?: string
  order?: number
  winProbability?: number
  [key: string]: unknown
}

export interface RawMazricaDealType {
  id: number
  name?: string
  phases?: RawMazricaPhase[]
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function transformStage(raw: RawMazricaPhase): PipelineStage {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    order: typeof raw.order === 'number' ? raw.order : undefined,
    win_probability: typeof raw.winProbability === 'number' ? raw.winProbability : undefined,
  }
}

export function transformPipeline(raw: RawMazricaDealType): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: (raw.phases ?? []).map(transformStage),
    is_active: raw.isActive ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
