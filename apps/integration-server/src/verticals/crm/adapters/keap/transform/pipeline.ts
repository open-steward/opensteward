import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * `RestOpportunityStage` in the Keap REST v2 OpenAPI spec
 * (https://crm.infusionsoft.com/app/v3/api-docs/V2): `id` ("Stage ID"),
 * `name` ("Stage name"), `order` ("Stage order in pipeline"), `probability`
 * ("Win probability (0-100)"), `created_time`, `updated_time`.
 */
export interface RawKeapOpportunityStage {
  id: string
  name: string
  order?: number
  probability?: number
  target_number_days?: number
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

export function transformStage(raw: RawKeapOpportunityStage, position: number): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: position,
    win_probability: typeof raw.probability === 'number' ? raw.probability : undefined,
  }
}

/**
 * Keap has one opportunity pipeline per account: the account's stage list
 * (`GET /rest/v2/opportunities/stages`). It has no pipeline id or name, so
 * the adapter serves it as the single pipeline `default`. Stages are ordered
 * by the documented `order` field; the canonical `order` is the 0-indexed
 * position in that ordering.
 */
export function transformPipeline(stages: RawKeapOpportunityStage[]): Pipeline {
  const ordered = stages
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ao = typeof a.s.order === 'number' ? a.s.order : Number.POSITIVE_INFINITY
      const bo = typeof b.s.order === 'number' ? b.s.order : Number.POSITIVE_INFINITY
      return ao === bo ? a.i - b.i : ao - bo
    })
    .map(({ s }) => s)
  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages: ordered.map((s, i) => transformStage(s, i)),
    metadata: { stages },
  }
}
