/**
 * Nimble deal pipeline → canonical Pipeline.
 *
 * Shape: `Pipeline.DealsPipeline` and `Pipeline.DealStage` in the OpenAPI spec
 * embedded in https://www.nimble.com/developers/docs/ (Nimble API):
 *   pipeline_id  "The unique ID of a pipeline"
 *   name         string
 *   created, updated  string (format not documented)
 *   archived_at  "The timestamp of when the pipeline was archived (None if it's not archived)"
 *   stages       array of Pipeline.DealStage: stage_id, name ("Name of the stage"), …
 *
 * DealStage documents no position field, so `order` is left out.
 * `default_probability` is documented without a scale, so `win_probability`
 * is left out too.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawNimbleStage {
  stage_id: string
  name: string
  [key: string]: unknown
}

export interface RawNimblePipeline {
  pipeline_id: string
  name: string
  created?: string
  updated?: string
  archived_at?: string | null
  stages?: RawNimbleStage[]
  [key: string]: unknown
}

function required(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Nimble: deal pipeline response has no ${what}`)
  }
  return value
}

function transformStage(raw: RawNimbleStage): PipelineStage {
  return {
    id: required(raw.stage_id, 'stage_id'),
    name: required(raw.name, 'stage name'),
  }
}

export function transformPipeline(raw: RawNimblePipeline): Pipeline {
  const out: Pipeline = {
    id: required(raw.pipeline_id, 'pipeline_id'),
    name: required(raw.name, 'pipeline name'),
    stages: (raw.stages ?? []).map(transformStage),
    created_at: toIsoDatetime(raw.created),
    updated_at: toIsoDatetime(raw.updated),
    metadata: raw,
  }
  if ('archived_at' in raw) out.is_active = raw.archived_at == null
  return out
}
