import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline } from '../../../schema/pipeline'
import { requireId, requireString } from '../fields'

/**
 * One stage, as krayin/rest-api src/Http/Resources/V1/Setting/StageResource.php
 * emits it: id, code, name, lead_value, formatted_lead_value, is_user_defined,
 * created_at, updated_at.
 */
export interface RawKrayinStage {
  id?: number | string
  code?: string
  name?: string
  lead_value?: number | string | null
  formatted_lead_value?: string
  is_user_defined?: number | boolean
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * GET /api/v1/settings/pipelines and /api/v1/settings/pipelines/{id}.
 * Fields from PipelineResource.php: id, name, is_default, rotten_days,
 * stages (StageResource collection), created_at, updated_at. The documented
 * `Pipeline` schema (src/Docs/Models/Settings/Pipeline.php) lists the same
 * scalars with example `"created_at": "2020-01-27 17:50:45"`.
 */
export interface RawKrayinPipeline {
  id?: number | string
  name?: string
  is_default?: number | boolean | string
  rotten_days?: number | string
  stages?: RawKrayinStage[]
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformPipeline(raw: RawKrayinPipeline): Pipeline {
  return {
    id: requireId(raw.id, 'pipeline'),
    name: requireString(raw.name, 'pipeline name'),
    // Krayin's Pipeline::stages() is `->orderBy('sort_order', 'ASC')`
    // (krayin/laravel-crm packages/Webkul/Lead/src/Models/Pipeline.php), so
    // the array position is the stage's place in the pipeline.
    stages: raw.stages?.map((s, i) => ({
      id: requireId(s.id, 'pipeline stage'),
      name: requireString(s.name, 'pipeline stage name'),
      order: i,
    })),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}
