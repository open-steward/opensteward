/**
 * Transforms Simplicate sales-progress records into the canonical Pipeline
 * schema.
 *
 * Backing endpoint: GET /sales/salesprogress
 * Docs: https://developer.simplicate.com/docs/api/v2/reference/get-sales-salesprogress/
 *
 * Simplicate has no named "pipeline" object — instead it exposes a flat list of
 * progress phases that act as ordered stages within a single implicit pipeline.
 * We synthesise a single Pipeline wrapper around the full progress list.
 *
 * salesprogress fields:
 *   id             → stage.id
 *   label          → stage.name
 *   position       → stage.order  (0-indexed sort order)
 *   chance_to_score → stage.win_probability  (0-100 float → 0-100 int)
 *   color          → metadata only
 */
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSimplicateSalesProgress {
  id: string
  label?: string
  position?: number
  chance_to_score?: number
  color?: string
  [key: string]: unknown
}

function transformStage(raw: RawSimplicateSalesProgress): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.label ?? '',
    order: raw.position,
    win_probability:
      raw.chance_to_score != null ? Math.round(raw.chance_to_score) : undefined,
  }
}

/**
 * Synthesise a single Pipeline from a list of Simplicate salesprogress records.
 * The stages are sorted by `position` (ascending) before mapping.
 */
export function transformPipelineFromProgress(
  progresses: RawSimplicateSalesProgress[],
): Pipeline {
  const sorted = [...progresses].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  )
  return {
    id: 'default',
    name: 'Sales Pipeline',
    is_active: true,
    stages: sorted.map(transformStage),
    metadata: { progresses },
  }
}
