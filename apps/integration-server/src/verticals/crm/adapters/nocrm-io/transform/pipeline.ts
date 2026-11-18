/**
 * noCRM.io Pipeline → canonical Pipeline transform.
 *
 * Wire shape (GET /pipelines):
 *   id, name, created_at, updated_at
 *
 * Steps are fetched separately (GET /steps?pipeline_id={id}) and embedded.
 *
 * Wire shape (GET /steps or /steps/{id}):
 *   id, name, position, pipeline_id
 */

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawNocrmStep {
  id: number | string
  name?: string | null
  position?: number | null
  pipeline_id?: number | string | null
  [key: string]: unknown
}

export interface RawNocrmPipeline {
  id: number | string
  name?: string | null
  created_at?: string | null
  updated_at?: string | null
  steps?: RawNocrmStep[] | null
  [key: string]: unknown
}

function transformStep(raw: RawNocrmStep): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    order: raw.position != null ? Number(raw.position) : undefined,
  }
}

export function transformPipeline(raw: RawNocrmPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: Array.isArray(raw.steps)
      ? raw.steps.map(transformStep)
      : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}
