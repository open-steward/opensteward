/**
 * Sellsy opportunity pipeline → canonical Pipeline.
 *
 * Source shapes, from the Sellsy API v2 OpenAPI spec
 * (https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml, the file the
 * Redoc page at https://api.sellsy.com/doc/v2/ loads):
 *
 * - GET /opportunities/pipelines returns `OpportunityPipelineCollectionItem`
 *   rows: `id` ("Internal Opportunity Pipeline ID"), `name` ("Opportunity
 *   Pipeline name"), `is_default`, `step` ("Count of steps") and `rank`. There
 *   is no inline steps array.
 * - GET /opportunities/pipelines/{pipelineId}/steps returns Step rows: `id`
 *   ("Internal Opportunity Pipeline Step ID"), `name`, `probability`
 *   ("Opportunity Pipeline Step probability", 0–100) and `rank` ("Pipeline
 *   rank in preferences", minimum 0).
 *
 * The spec documents no active/archived flag and no timestamps for either, so
 * `is_active`, `created_at` and `updated_at` are left out.
 */
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSellsyPipelineStep {
  id: number
  name: string
  probability?: number
  rank?: number
  [key: string]: unknown
}

export interface RawSellsyPipeline {
  id: number
  name: string
  is_default?: boolean
  step?: number
  rank?: number
  [key: string]: unknown
}

function transformStep(raw: RawSellsyPipelineStep): PipelineStage {
  const stage: PipelineStage = { id: String(raw.id), name: raw.name }
  if (typeof raw.rank === 'number') stage.order = raw.rank
  if (typeof raw.probability === 'number') stage.win_probability = raw.probability
  return stage
}

/**
 * `steps` are the rows of the pipeline's own steps endpoint, fetched by the
 * adapter; without them `stages` is left out rather than claimed empty.
 */
export function transformPipeline(
  raw: RawSellsyPipeline,
  steps?: RawSellsyPipelineStep[],
): Pipeline {
  const pipeline: Pipeline = {
    id: String(raw.id),
    name: raw.name,
    metadata: raw,
  }
  if (steps) pipeline.stages = steps.map(transformStep)
  return pipeline
}
