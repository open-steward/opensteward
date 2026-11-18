/**
 * Transform between Megaplan API v3 Program/Scheme entities and canonical Pipeline.
 *
 * Megaplan deal funnels are called "Programs" (ru: Программы) with "Scheme Stages".
 * v3 API fields:
 *   id, name, schemeStages (ordered array of stages), isActive,
 *   timeCreated, timeUpdated
 */

import type { Pipeline } from '../../../schema/pipeline'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMegaplanPipelineStage {
  id?: string | number
  name?: string
  /** 0-indexed order within the pipeline */
  order?: number
  /** Default win probability 0–100 */
  probability?: number
}

export interface RawMegaplanPipeline {
  id?: string | number
  name?: string
  schemeStages?: RawMegaplanPipelineStage[]
  isActive?: boolean
  timeCreated?: string | number
  timeUpdated?: string | number
  [key: string]: unknown
}

export function transformPipeline(raw: RawMegaplanPipeline): Pipeline {
  const stages = Array.isArray(raw.schemeStages)
    ? raw.schemeStages.map((s, idx) => ({
        id: String(s.id ?? idx),
        name: s.name ?? '',
        order: typeof s.order === 'number' ? s.order : idx,
        win_probability: typeof s.probability === 'number' ? s.probability : undefined,
      }))
    : undefined

  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    stages,
    is_active: typeof raw.isActive === 'boolean' ? raw.isActive : undefined,
    created_at: toIsoDatetime(raw.timeCreated),
    updated_at: toIsoDatetime(raw.timeUpdated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
