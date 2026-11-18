import type { Pipeline } from '../../../schema/pipeline'

/**
 * `DealPipelineAll` from https://app.pipelinecrm.com/openapi.json, returned by
 * GET /admin/deal_pipelines: "Returns `DealPipelineAll` with fields: id, name,
 * default, pipeline_type, description, created_at, updated_at, has_deals,
 * count_deals, won_stage, lost_stage".
 */
export interface RawPipelineCrmDealPipeline {
  id: number
  name?: string
  default?: boolean
  pipeline_type?: string | null
  description?: string | null
  created_at?: string
  updated_at?: string
  has_deals?: boolean
  count_deals?: number
  won_stage?: Record<string, unknown> | null
  lost_stage?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * `DealStageAll` from the same spec, returned by GET /admin/deal_stages:
 * "Returns `DealStageAll` with fields: id, created_at, updated_at, name,
 * percent, deal_pipeline_id".
 */
export interface RawPipelineCrmDealStage {
  id: number
  created_at?: string
  updated_at?: string
  /** "The label/name of the deal stage" */
  name?: string
  /** "The default percent probability of the deal closing that this deal stage represents" (nullable) */
  percent?: number | null
  /** "The Deal Pipeline ID that this deal stage belongs to" */
  deal_pipeline_id?: number
  [key: string]: unknown
}

function requireName(kind: string, id: number, name: unknown): string {
  if (typeof name !== 'string') {
    throw new Error(`Pipeline CRM ${kind} ${String(id)} has no name`)
  }
  return name
}

/**
 * A deal pipeline plus the stages whose `deal_pipeline_id` names it.
 *
 * `created_at`/`updated_at` are not mapped: the docs say "Dates are
 * `YYYY-MM-DD HH:MM:SS` in the user's time zone", with no offset, so they
 * cannot be turned into an ISO instant. They stay in `metadata`.
 */
export function transformPipeline(
  raw: RawPipelineCrmDealPipeline,
  stages: readonly RawPipelineCrmDealStage[],
): Pipeline {
  return {
    id: String(raw.id),
    name: requireName('deal pipeline', raw.id, raw.name),
    stages: stages.map((s) => ({
      id: String(s.id),
      name: requireName('deal stage', s.id, s.name),
      ...(typeof s.percent === 'number' ? { win_probability: s.percent } : {}),
    })),
    metadata: raw,
  }
}
