/**
 * Gold-Vision ↔ canonical Deal transforms.
 *
 * Gold-Vision uses the `opportunities` entity for deals/sales opportunities.
 *
 * Wire field reference (from /api/cosmos/opportunities metadata):
 *   id              — unique record identifier
 *   summary         — opportunity / deal name
 *   totalValue      — monetary value (number)
 *   currency        — ISO 4217 currency code (e.g. "GBP")
 *   state           — opportunity state label (e.g. "OPEN", "CLOSEDWON", "CLOSEDLOST")
 *   forecastStage   — current pipeline stage label (lookup field)
 *   forecastStageId — pipeline stage id
 *   pipelineId      — pipeline id
 *   accountId       — linked Account id
 *   contactIds      — array of linked Contact ids
 *   ownerId         — assigned user id
 *   forecastDate    — expected close date (ISO 8601)
 *   probability     — percentage probability 0–100
 *   createdDate     — ISO 8601 creation timestamp
 *   modifiedDate    — ISO 8601 last-modified timestamp
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawGoldVisionOpportunity {
  id?: string | number
  summary?: string
  totalValue?: string | number
  currency?: string
  state?: string
  forecastStage?: string | { id?: string | number; summary?: string }
  forecastStageId?: string | number
  pipelineId?: string | number
  accountId?: string | number
  contactIds?: Array<string | number>
  ownerId?: string | number
  forecastDate?: string
  probability?: string | number
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function resolveLabel(
  field: string | { id?: string | number; summary?: string } | undefined,
): string | undefined {
  if (!field) return undefined
  if (typeof field === 'string') return field || undefined
  return field.summary ?? undefined
}

export function transformDeal(raw: RawGoldVisionOpportunity): Deal {
  const valueRaw =
    typeof raw.totalValue === 'number'
      ? raw.totalValue
      : raw.totalValue != null
        ? parseFloat(String(raw.totalValue))
        : undefined
  const amount = valueRaw != null && !isNaN(valueRaw) ? valueRaw : undefined

  const probRaw =
    typeof raw.probability === 'number'
      ? raw.probability
      : raw.probability != null
        ? parseFloat(String(raw.probability))
        : undefined
  const probability =
    probRaw != null && !isNaN(probRaw) ? probRaw : undefined

  return {
    id: String(raw.id ?? ''),
    title: raw.summary ?? '',
    value:
      amount !== undefined
        ? { amount, currency: raw.currency ?? 'GBP' }
        : undefined,
    status: raw.state ?? undefined,
    stage: resolveLabel(raw.forecastStage),
    stage_id:
      raw.forecastStageId != null ? String(raw.forecastStageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    contact_ids:
      Array.isArray(raw.contactIds) && raw.contactIds.length > 0
        ? raw.contactIds.map(String)
        : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    close_date: toIsoDatetime(raw.forecastDate),
    probability,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(
  data: Partial<Deal>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.summary = data.title
  if (data.value?.amount !== undefined) out.totalValue = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.state = data.status
  if (data.stage_id !== undefined) out.forecastStageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.close_date !== undefined) out.forecastDate = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  return out
}
