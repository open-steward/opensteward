/**
 * Transform between Megaplan API v3 Deal/Transaction entities and canonical Deal.
 *
 * Megaplan calls deals "Deals" or "Transactions" (ru: Сделки).
 * v3 API fields:
 *   id, contentType, name, amount (major units), amountCurrency, status,
 *   probability, contractor (linked contact/company), responsible,
 *   expectedCloseDate, timeCreated, timeUpdated
 *
 * The canonical `value.amount` is in INTEGER MINOR UNITS (cents).
 * Megaplan `amount` is a floating-point major-unit value (e.g. 1500.00 = $15.00).
 * Conversion: canonical = Math.round(megaplan_amount * 100).
 */

import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMegaplanDeal {
  id?: string | number
  contentType?: string
  name?: string
  /** Major-unit deal value (e.g. 1500.00 = 1500 currency units) */
  amount?: number | string
  amountCurrency?: string
  status?: string
  /** Probability 0–100 */
  probability?: number
  /** Linked contractor (company/contact) reference */
  contractor?: { id?: string | number; contentType?: string; name?: string }
  /** Responsible employee reference */
  responsible?: { id?: string | number; contentType?: string }
  responsibles?: Array<{ id?: string | number; contentType?: string }>
  /** Pipeline/funnel reference */
  program?: { id?: string | number; name?: string }
  /** Stage within the pipeline */
  schemeStage?: { id?: string | number; name?: string }
  /** ISO-8601 date or timestamp */
  expectedCloseDate?: string
  timeCreated?: string | number
  timeUpdated?: string | number
  [key: string]: unknown
}

export function transformDeal(raw: RawMegaplanDeal): Deal {
  const rawAmount = typeof raw.amount === 'string' ? parseFloat(raw.amount) : raw.amount
  const currency = raw.amountCurrency ?? 'RUB'
  const value =
    rawAmount != null && isFinite(rawAmount)
      ? { amount: Math.round(rawAmount * 100), currency }
      : undefined

  const responsibleRef =
    raw.responsible ??
    (Array.isArray(raw.responsibles) ? raw.responsibles[0] : undefined)
  const ownerId = responsibleRef?.id != null ? String(responsibleRef.id) : undefined

  const contractorId = raw.contractor?.id != null ? String(raw.contractor.id) : undefined

  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    value,
    status: raw.status != null && typeof raw.status === 'string' ? raw.status.toLowerCase() : undefined,
    stage: raw.schemeStage?.name ?? undefined,
    stage_id: raw.schemeStage?.id != null ? String(raw.schemeStage.id) : undefined,
    pipeline_id: raw.program?.id != null ? String(raw.program.id) : undefined,
    company_id: contractorId,
    owner_id: ownerId,
    probability: typeof raw.probability === 'number' ? raw.probability : undefined,
    close_date: toIsoDatetime(raw.expectedCloseDate),
    created_at: toIsoDatetime(raw.timeCreated),
    updated_at: toIsoDatetime(raw.timeUpdated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['name'] = data.title
  if (data.value !== undefined) {
    // Convert minor units back to major units
    out['amount'] = data.value.amount / 100
    out['amountCurrency'] = data.value.currency
  }
  if (data.status !== undefined) out['status'] = data.status
  if (data.probability !== undefined) out['probability'] = data.probability
  if (data.company_id !== undefined) out['contractor'] = { id: data.company_id }
  if (data.owner_id !== undefined) out['responsible'] = { id: data.owner_id }
  if (data.close_date !== undefined) out['expectedCloseDate'] = data.close_date
  if (data.stage_id !== undefined) out['schemeStage'] = { id: data.stage_id }
  if (data.pipeline_id !== undefined) out['program'] = { id: data.pipeline_id }
  return out
}
