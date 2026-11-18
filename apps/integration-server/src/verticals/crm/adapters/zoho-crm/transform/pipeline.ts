import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * One stage of a pipeline, as an entry of the pipeline's `maps` array in
 * GET /settings/pipeline?layout_id={id}.
 * https://www.zoho.com/crm/developer/docs/api/v8/get-pipelines.html
 */
export interface RawZohoPipelineStage {
  id: string
  display_value: string
  sequence_number?: number
  [key: string]: unknown
}

/** One entry of `pipeline` in the same response. */
export interface RawZohoPipeline {
  id: string
  display_value: string
  maps?: RawZohoPipelineStage[]
  [key: string]: unknown
}

/**
 * The stages in pipeline order. get-pipelines.html gives no description of
 * `sequence_number`, only a sample that numbers stages from 1, so the
 * canonical 0-indexed `order` is each stage's rank by sequence_number rather
 * than sequence_number minus an assumed base. A stage without a
 * sequence_number keeps no order and follows the ranked ones.
 */
function transformStages(maps: RawZohoPipelineStage[]): PipelineStage[] {
  const ranked = maps
    .filter((s) => typeof s.sequence_number === 'number')
    .sort((a, b) => (a.sequence_number as number) - (b.sequence_number as number))
  const unranked = maps.filter((s) => typeof s.sequence_number !== 'number')
  return [
    ...ranked.map((s, i) => ({ id: String(s.id), name: s.display_value, order: i })),
    ...unranked.map((s) => ({ id: String(s.id), name: s.display_value })),
  ]
}

export function transformPipeline(raw: RawZohoPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.display_value,
    stages: transformStages(raw.maps ?? []),
    metadata: raw,
  }
}
