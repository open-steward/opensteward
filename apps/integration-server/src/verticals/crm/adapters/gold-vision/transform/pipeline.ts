/**
 * Gold-Vision ↔ canonical Pipeline transforms.
 *
 * Gold-Vision pipelines are accessible via the metadata of the
 * `opportunities` entity (forecastStage lookup options) or via a dedicated
 * pipeline endpoint if available.
 *
 * Wire field reference (pipeline entity or from metadata):
 *   id            — unique pipeline identifier
 *   summary       — pipeline name
 *   stages        — ordered array of stage records
 *   isActive      — boolean
 *   createdDate   — ISO 8601 creation timestamp
 *   modifiedDate  — ISO 8601 last-modified timestamp
 *
 * Stage wire fields:
 *   id            — stage id
 *   summary       — stage label
 *   sortOrder     — integer sort order (0-indexed)
 *   probability   — default probability 0–100
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawGoldVisionPipelineStage {
  id?: string | number
  summary?: string
  sortOrder?: string | number
  probability?: string | number
  [key: string]: unknown
}

export interface RawGoldVisionPipeline {
  id?: string | number
  summary?: string
  stages?: RawGoldVisionPipelineStage[]
  isActive?: boolean
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function transformStage(
  raw: RawGoldVisionPipelineStage,
): PipelineStage {
  const orderRaw =
    typeof raw.sortOrder === 'number'
      ? raw.sortOrder
      : raw.sortOrder != null
        ? parseInt(String(raw.sortOrder), 10)
        : undefined
  const order = orderRaw != null && !isNaN(orderRaw) ? orderRaw : undefined

  const probRaw =
    typeof raw.probability === 'number'
      ? raw.probability
      : raw.probability != null
        ? parseFloat(String(raw.probability))
        : undefined
  const winProbability =
    probRaw != null && !isNaN(probRaw) ? probRaw : undefined

  return {
    id: String(raw.id ?? ''),
    name: raw.summary ?? '',
    order,
    win_probability: winProbability,
  }
}

export function transformPipeline(raw: RawGoldVisionPipeline): Pipeline {
  return {
    id: String(raw.id ?? ''),
    name: raw.summary ?? '',
    stages: (raw.stages ?? []).map(transformStage),
    is_active: raw.isActive ?? undefined,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
