/**
 * Spiro opportunities (JSON:API `opportunity` resources) → canonical Deal.
 *
 * GET /api/v1/opportunities and GET /api/v1/opportunities/{id}, documented example item:
 *   { "id": "117", "type": "opportunity",
 *     "attributes": { "id": 117, "name": "Ernser-Lueilwitz", "close_at": "2026-09-26",
 *       "amount": "6236.41", "updated_at": "2026-09-01T09:57:39.426Z",
 *       "description": "Shoes & Automotive", "custom": {}, "external_id": null,
 *       "currency": null, "created_at": "2026-09-01T09:57:39.426Z" },
 *     "relationships": { "company": { "data": { "id": "478", "type": "company" } },
 *       "pipeline": { "data": { "id": "126", "type": "pipeline" } },
 *       "opportunity_stage": { "data": { "id": "367", "type": "opportunity_stage" } },
 *       "user": { "data": { "id": "1061", "type": "user" } } } }
 *
 * Money follows the vertical's reference adapter: the amount as the platform
 * states it (a decimal string, major units), with the currency the record
 * carries. `currency` is null in every documented example and its format is
 * not described, so `value` is set only when the record carries an ISO 4217
 * code; otherwise the amount stays in metadata. No currency is assumed.
 *
 * `close_at` is a calendar date ("2026-09-26") and canonical close_date is an
 * instant; turning one into the other invents a time and a zone, so it stays
 * in metadata. No status, probability or contact list is documented on the
 * resource.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import { Iso4217Currency } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import { relatedId, type SpiroResource } from '../client'

export interface SpiroOpportunityAttributes {
  id: number
  name: string
  close_at: string | null
  amount: string | null
  updated_at: string
  description: string | null
  custom: Record<string, unknown>
  external_id: string | null
  currency: string | null
  created_at: string
}

export type RawSpiroOpportunity = SpiroResource<SpiroOpportunityAttributes>

function dealValue(a: SpiroOpportunityAttributes): Deal['value'] {
  if (a.amount == null || a.currency == null) return undefined
  const currency = Iso4217Currency.safeParse(a.currency)
  const amount = Number(a.amount)
  if (!currency.success || a.amount.trim() === '' || !Number.isFinite(amount)) return undefined
  return { amount, currency: currency.data }
}

export function transformDeal(raw: RawSpiroOpportunity): Deal {
  const a = raw.attributes
  return {
    id: raw.id,
    title: a.name,
    value: dealValue(a),
    stage_id: relatedId(raw, 'opportunity_stage'),
    pipeline_id: relatedId(raw, 'pipeline'),
    company_id: relatedId(raw, 'company'),
    owner_id: relatedId(raw, 'user'),
    created_at: a.created_at,
    updated_at: a.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) {
    // Same unit transformDeal reads: the amount as Spiro states it, so a
    // read value written back is unchanged.
    out.amount = data.value.amount
  }
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage !== undefined) out.stage = data.stage
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.probability !== undefined) out.probability = data.probability
  if (data.close_date !== undefined) out.close_date = data.close_date
  if (data.contact_ids !== undefined) out.contact_ids = data.contact_ids
  return out
}
