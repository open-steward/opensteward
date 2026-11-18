/**
 * Follow Up Boss deal ↔ canonical Deal transform.
 *
 * FUB deal wire shape (GET /v1/deals, GET /v1/deals/:id):
 *   id                  number
 *   name                string   — deal name
 *   personId            number   — primary associated contact id
 *   stageId             number
 *   pipelineId          number
 *   price               int32    — monetary value in whole dollars (major units)
 *   projectedCloseDate  string   — ISO 8601 date
 *   status              string   — e.g. "active", "won", "lost"
 *   assignedTo          string   — agent email
 *   created             string   — ISO 8601
 *   updated             string   — ISO 8601
 *
 * Money convention:
 *   FUB stores `price` as integer whole-dollar (major) units.
 *   Canonical Money.amount is integer minor units (cents).
 *   Conversion: canonical = price × 100  (read); price = canonical ÷ 100  (write).
 */
import type { Deal } from '../../../schema/deal'

export interface RawFollowUpBossDeal {
  id?: number | string
  name?: string
  personId?: number | string
  stageId?: number | string
  pipelineId?: number | string
  /** Whole-dollar integer (major units), e.g. 450000 = $450,000. */
  price?: number | string
  projectedCloseDate?: string
  status?: string
  assignedTo?: string
  assignedUserId?: number | string
  created?: string
  updated?: string
  [key: string]: unknown
}

/**
 * Convert FUB major-unit price (whole dollars) to canonical integer minor units (cents).
 */
function priceToMinorUnits(raw: number | string | undefined): number | undefined {
  if (raw == null) return undefined
  const dollars = Number(raw)
  if (isNaN(dollars)) return undefined
  return Math.round(dollars * 100)
}

/**
 * Convert canonical integer minor units (cents) back to FUB whole-dollar integer.
 */
function minorUnitsToDollars(minor: number | undefined): number | undefined {
  if (minor == null) return undefined
  return Math.round(minor / 100)
}

export function transformDeal(raw: RawFollowUpBossDeal): Deal {
  const priceMinor = priceToMinorUnits(raw.price)
  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    value:
      priceMinor != null
        ? { amount: priceMinor, currency: 'USD' }
        : undefined,
    status: raw.status ?? undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    contact_ids: raw.personId != null ? [String(raw.personId)] : undefined,
    owner_id:
      raw.assignedTo ??
      (raw.assignedUserId != null ? String(raw.assignedUserId) : undefined),
    close_date: raw.projectedCloseDate ?? undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.price = minorUnitsToDollars(data.value.amount)
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.close_date !== undefined) out.projectedCloseDate = data.close_date
  if (data.owner_id !== undefined) out.assignedTo = data.owner_id
  if (data.contact_ids?.[0] !== undefined) out.personId = data.contact_ids[0]
  return out
}
