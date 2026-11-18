/**
 * Transform CentralStationCRM "deal_type" objects to canonical Pipeline.
 *
 * Wire shape (GET /deal_types.json):
 * [
 *   {
 *     deal_type: {
 *       id, name, singular_item_name, plural_item_name,
 *       default_view, has_monetary_value, has_muted_until_date,
 *       has_probability, has_target_date, position,
 *       created_at, updated_at,
 *       deal_type_stages: [
 *         { id, deal_type_id, name, description, position, stage_type, color_type,
 *           created_at, updated_at }
 *       ]
 *     }
 *   }
 * ]
 *
 * stage_type: "default" | "won" | "lost"
 * Docs: https://api.centralstationcrm.net/api-docs/index.html
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

// ── Raw types ────────────────────────────────────────────────────────────────

export interface RawCentralStationDealTypeStage {
  id: number | string
  deal_type_id?: number | string
  name?: string
  description?: string
  position?: number
  stage_type?: string
  color_type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawCentralStationDealType {
  id: number | string
  name?: string
  singular_item_name?: string
  plural_item_name?: string
  default_view?: string
  has_monetary_value?: boolean
  has_muted_until_date?: boolean
  has_probability?: boolean
  has_target_date?: boolean
  position?: number
  created_at?: string
  updated_at?: string
  deal_type_stages?: RawCentralStationDealTypeStage[]
  [key: string]: unknown
}

export interface RawCentralStationDealTypeWrapper {
  deal_type: RawCentralStationDealType
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

function transformStage(raw: RawCentralStationDealTypeStage): PipelineStage {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    order: raw.position,
  }
}

export function transformPipeline(raw: RawCentralStationDealType): Pipeline {
  const stages = (raw.deal_type_stages ?? []).map(transformStage)

  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: stages.length > 0 ? stages : undefined,
    is_active: true,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}
