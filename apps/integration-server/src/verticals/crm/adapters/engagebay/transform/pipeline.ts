/**
 * Transform between EngageBay track wire format and canonical Pipeline.
 *
 * In EngageBay, "tracks" are the deal pipeline equivalent.
 * Track fields: id, name, milestones (stages array).
 * Milestone fields: id, name, probability.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawEngageBayMilestone {
  id?: number | string
  name?: string
  probability?: number
  display_order?: number
  [key: string]: unknown
}

export interface RawEngageBayTrack {
  id?: number | string
  name?: string
  milestones?: RawEngageBayMilestone[]
  created_time?: number | string
  updated_time?: number | string
  [key: string]: unknown
}

export function transformPipeline(raw: RawEngageBayTrack): Pipeline {
  const stages: PipelineStage[] = (raw.milestones ?? []).map((m, idx) => ({
    id: String(m.id ?? idx),
    name: m.name ?? '',
    order: m.display_order ?? idx,
    win_probability: m.probability,
  }))

  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    stages: stages.length > 0 ? stages : undefined,
    created_at: toIsoDatetime(raw.created_time),
    updated_at: toIsoDatetime(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
