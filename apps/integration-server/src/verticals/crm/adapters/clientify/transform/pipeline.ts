import type { Pipeline } from '../../../schema/pipeline'

/**
 * One deal pipeline as GET /v1/deals/pipelines/ and
 * GET /v1/deals/pipelines/:deal_pipeline_id/ return it
 * (https://developer.clientify.com/, "List Deal Pipelines" example):
 *
 *   { "url": ..., "id": 17, "user_company": "felipemarin", "name": "Por defecto",
 *     "stages": [{ "url": ..., "id": 49, "pipeline": ..., "name": "Toma de contacto",
 *                  "position": 0, "probability": 2 }],
 *     "is_default": true, "user_default": false }
 */
export interface RawClientifyPipelineStage {
  url?: string
  id: number
  pipeline?: string
  name: string
  position?: number
  probability?: number
  [key: string]: unknown
}

export interface RawClientifyPipeline {
  url?: string
  id: number
  user_company?: string
  name: string
  stages?: RawClientifyPipelineStage[]
  is_default?: boolean
  user_default?: boolean
  [key: string]: unknown
}

export function transformPipeline(raw: RawClientifyPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    // `probability` is left out: the docs give it on a 1–10 scale with no
    // statement of what it means in percent, and win_probability is 0–100.
    stages: (raw.stages ?? []).map((s) => ({
      id: String(s.id),
      name: s.name,
      order: s.position,
    })),
    metadata: raw,
  }
}
