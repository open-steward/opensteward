/**
 * Spiro pipelines (JSON:API `pipeline` resources) → canonical Pipeline.
 *
 * GET /api/v1/pipelines, documented example item:
 *   { "id": "133", "type": "pipeline",
 *     "attributes": { "id": 133, "name": "Pipeline 16", "is_active": true, "index": 0 },
 *     "relationships": { "opportunity_stages": { "data": [ { "id": "385", "type": "opportunity_stage" }, ... ] } } }
 *
 * A pipeline carries only its stages' ids. The stages themselves come from
 * GET /api/v1/pipelines/{pipeline_id}/opportunity_stages, documented item:
 *   { "id": "379", "type": "opportunity_stage",
 *     "attributes": { "id": 379, "name": "Stage 37", "is_closed": false, "is_won": false,
 *                     "is_active": true, "index": 1, "created_at": "2026-09-01T09:57:39.544Z" },
 *     "relationships": { "pipeline": { "data": { "id": "131", "type": "pipeline" } } } }
 *
 * Stages are ordered by Spiro's `index`. Canonical `order` is 0-indexed, and
 * the spec does not say where `index` starts (its stage example runs 1, 2, 3),
 * so `order` is not set; the array order carries it. No stage probability is
 * documented.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import type { SpiroResource } from '../client'

export interface SpiroPipelineAttributes {
  id: number
  name: string
  is_active: boolean
  index: number
}

export interface SpiroStageAttributes {
  id: number
  name: string
  is_closed: boolean
  is_won: boolean
  is_active: boolean
  index: number
  created_at: string
}

export type RawSpiroPipeline = SpiroResource<SpiroPipelineAttributes>
export type RawSpiroPipelineStage = SpiroResource<SpiroStageAttributes>

function transformStage(raw: RawSpiroPipelineStage): PipelineStage {
  return { id: raw.id, name: raw.attributes.name }
}

export function transformPipeline(
  raw: RawSpiroPipeline,
  stages: RawSpiroPipelineStage[],
): Pipeline {
  const ordered = [...stages].sort((a, b) => a.attributes.index - b.attributes.index)
  return {
    id: raw.id,
    name: raw.attributes.name,
    stages: ordered.map(transformStage),
    is_active: raw.attributes.is_active,
    metadata: { ...raw, opportunity_stages: stages } as unknown as Record<string, unknown>,
  }
}
