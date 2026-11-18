import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Capsule pipelines and their milestones (stages).
 *
 * A Capsule account can hold several pipelines
 * (https://developer.capsulecrm.com/v2/operations/Pipeline: "Capsule accounts
 * can have at most 30 active (non-archived) pipelines at any one time"), and a
 * pipeline's milestones are its stages. Fields below are the documented model
 * attributes only:
 *
 * https://developer.capsulecrm.com/v2/models/pipeline — id, name, description,
 *   deleted ("Indicates whether this pipeline is archived."), createdAt, updatedAt.
 * https://developer.capsulecrm.com/v2/models/milestone — id, name, description,
 *   complete, probability ("The default probability (as a percentage) of winning
 *   an opportunity that progressed to this milestone."), pipeline, daysUntilStale,
 *   createdAt, updatedAt.
 *
 * The milestone model documents no position field, so `order` is left unset.
 */
export interface RawCapsulePipeline {
  id: number
  name: string
  description?: string
  deleted?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface RawCapsuleMilestone {
  id: number
  name: string
  description?: string
  complete?: boolean
  probability?: number
  pipeline?: { id: number; name?: string }
  daysUntilStale?: number | null
  createdAt?: string
  updatedAt?: string
}

function transformStage(raw: RawCapsuleMilestone): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    win_probability: raw.probability,
  }
}

export function transformPipeline(
  raw: RawCapsulePipeline,
  milestones: RawCapsuleMilestone[],
): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    is_active: typeof raw.deleted === 'boolean' ? !raw.deleted : undefined,
    stages: milestones.map(transformStage),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: { pipeline: raw, milestones },
  }
}
