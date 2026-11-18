import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * A stage as `GET /api/v2/stages` and `GET /api/v2/stages/{id}` return it
 * (getStages / getStage in https://developers.pipedrive.com/docs/api/v2/openapi.yaml).
 */
export interface RawPipedriveStage {
  /** "The ID of the stage" */
  id: number
  /** "The name of the stage" */
  name: string
  /** "Defines the order of the stage" */
  order_nr?: number
  /** "The success probability percentage of the deal. Used/shown when the deal weighted values are used." */
  deal_probability?: number
  /** "The ID of the pipeline to add the stage to" */
  pipeline_id?: number
  /** "Whether the stage is marked as deleted or not" */
  is_deleted?: boolean
  [key: string]: unknown
}

/**
 * A pipeline as `GET /api/v2/pipelines` and `GET /api/v2/pipelines/{id}`
 * return it (getPipelines / getPipeline in the v2 spec). v1's `active` is
 * gone: the v2 migration guide says `"is_deleted": false, // replaces
 * "active". NB: Negation of the old value.`
 */
export interface RawPipedrivePipeline {
  /** "The ID of the pipeline" */
  id: number
  /** "The name of the pipeline" */
  name: string
  /** "Whether this pipeline is marked as deleted or not" */
  is_deleted?: boolean
  /** "The pipeline creation time" */
  add_time?: string
  /** "The pipeline update time" */
  update_time?: string | null
  [key: string]: unknown
}

function transformStage(raw: RawPipedriveStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name,
    order: raw.order_nr,
    win_probability: raw.deal_probability,
  }
}

/**
 * `stages` are the pipeline's own, fetched from `/api/v2/stages` (a v2
 * pipeline carries none) in `order_nr` order. A stage "marked as deleted"
 * (`is_deleted`) is no longer one of the pipeline's stages and is left out.
 */
export function transformPipeline(
  raw: RawPipedrivePipeline,
  stages: RawPipedriveStage[],
): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    is_active: typeof raw.is_deleted === 'boolean' ? !raw.is_deleted : undefined,
    stages: stages.filter((s) => s.is_deleted !== true).map(transformStage),
    created_at: toIsoDatetime(raw.add_time),
    updated_at: toIsoDatetime(raw.update_time),
    metadata: raw,
  }
}
