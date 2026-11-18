import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * One entry of `Pipeline.steps` when the request sends `expand=steps`
 * (vendor OpenAPI `components.schemas.batchStepInput`). Without `expand` the
 * docs say "the URI link will be returned instead".
 */
export interface RawPipelinerStep {
  id?: string
  name?: string
  description?: string
  /** "Probability percent associated with the step (0-100) ... null for lead/quote process steps." */
  percent?: number | null
  /** "Position of the step within its pipeline or process; lower values appear first." */
  sort_order?: number | null
  timeframe?: number
  revision?: number
  [key: string]: unknown
}

/** Vendor OpenAPI `components.schemas.Pipeline`. */
export interface RawPipelinerPipeline {
  id: string
  name: string
  is_delete_protected?: boolean
  is_deleted?: boolean
  /** "All dates are stored in the UTC timezone." */
  created?: string
  modified?: string
  color?: number
  revision?: number
  /** "Steps associated with this Pipeline." */
  steps?: (RawPipelinerStep | string)[]
  opportunity_types?: unknown[]
  [key: string]: unknown
}

type CheckedStep = RawPipelinerStep & { id: string; name: string }

function expandedSteps(raw: RawPipelinerPipeline): CheckedStep[] {
  return (raw.steps ?? []).map((s): CheckedStep => {
    if (typeof s !== 'object' || s === null) {
      throw new Error(
        `Pipeliner: pipeline ${raw.id} steps were not expanded (request expand=steps)`,
      )
    }
    if (typeof s.id !== 'string' || s.id === '') {
      throw new Error(`Pipeliner: pipeline ${raw.id} has a step without an id`)
    }
    if (typeof s.name !== 'string') {
      throw new Error(`Pipeliner: pipeline ${raw.id} step ${s.id} has no name`)
    }
    return { ...s, id: s.id, name: s.name }
  })
}

/**
 * Stages in `sort_order` ("lower values appear first"); a step without a
 * sort_order keeps its response position after the ordered ones. `order` is
 * the 0-based position in that sequence.
 */
export function transformPipeline(raw: RawPipelinerPipeline): Pipeline {
  const steps = expandedSteps(raw)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ao = typeof a.s.sort_order === 'number' ? a.s.sort_order : Infinity
      const bo = typeof b.s.sort_order === 'number' ? b.s.sort_order : Infinity
      return ao === bo ? a.i - b.i : ao - bo
    })
    .map(({ s }) => s)
  const stages: PipelineStage[] = steps.map((s, order) => ({
    id: s.id,
    name: s.name,
    order,
    ...(typeof s.percent === 'number' ? { win_probability: s.percent } : {}),
  }))
  return {
    id: String(raw.id),
    name: raw.name,
    stages,
    created_at: toIsoDatetime(raw.created),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw,
  }
}
