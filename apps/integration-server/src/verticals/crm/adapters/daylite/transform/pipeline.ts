import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Raw Daylite pipeline stage as returned inside a pipeline object or via
 * GET /v1/pipeline_stages/:id.
 *
 * The Daylite REST API uses snake_case field names.
 * The ordering field is 1-based; we normalise it to 0-indexed for the
 * canonical PipelineStage.order field.
 *
 * Docs: https://developer.daylite.app/reference/pipeline-stage.md
 */
export interface RawDaylitePipelineStage {
  /** Relative resource URL, e.g. "/v1/pipeline_stages/3" */
  self?: string
  name?: string
  /**
   * 1-based ordering index within the pipeline.
   * The API field is `ordering` (not `order`).
   */
  ordering?: number
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

/**
 * Raw Daylite pipeline as returned by GET /v1/pipelines and
 * GET /v1/pipelines/:id.
 *
 * Docs: https://developer.daylite.app/reference/pipeline.md
 */
export interface RawDaylitePipeline {
  /** Relative resource URL, e.g. "/v1/pipelines/1" */
  self?: string
  name?: string
  stages?: RawDaylitePipelineStage[]
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

function extractId(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/(\d+)$/)
  return match ? match[1] : undefined
}

function transformStage(raw: RawDaylitePipelineStage): PipelineStage {
  const stageId = extractId(raw.self) ?? String(raw['id'] ?? '')
  return {
    id: stageId,
    name: raw.name ?? stageId,
    // `ordering` is 1-based; normalise to 0-indexed for canonical interface
    order: raw.ordering != null ? raw.ordering - 1 : undefined,
    // Daylite pipeline stages do not carry a per-stage probability field
    win_probability: undefined,
  }
}

export function transformPipeline(raw: RawDaylitePipeline): Pipeline {
  const selfId = extractId(raw.self)

  return {
    id: selfId ?? String(raw['id'] ?? ''),
    name: raw.name ?? '',
    stages: (raw.stages ?? []).map(transformStage),
    created_at: raw.create_date ?? undefined,
    updated_at: raw.modify_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
