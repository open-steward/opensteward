/**
 * Transform 1CRM Opportunity records to/from the canonical Deal schema.
 *
 * 1CRM module: Opportunity
 * Key API fields: id, name, amount, currency_id, sales_stage, probability,
 *   close_date, account_id, assigned_user_id, date_entered, date_modified
 *
 * sales_stage values (typical): Prospecting, Qualification, Needs Analysis,
 *   Value Proposition, Id. Decision Makers, Perception Analysis,
 *   Proposal/Price Quote, Negotiation/Review, Closed Won, Closed Lost
 */

import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'

export interface Raw1CrmOpportunity {
  id: string
  name?: string
  amount?: number | string
  currency_id?: string
  sales_stage?: string
  probability?: number | string
  close_date?: string
  account_id?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

/**
 * 1CRM stores amounts as major currency units (e.g. 50000.00 USD).
 * The canonical Money.amount is INTEGER MINOR UNITS (cents).
 * Multiply by 100 and round when reading; divide by 100 when writing.
 */
function toMinorUnits(major: string | number): number | undefined {
  const n = typeof major === 'number' ? major : parseFloat(major)
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

function toMajorUnits(minor: number): number {
  return minor / 100
}

export function transformDeal(raw: Raw1CrmOpportunity): Deal {
  const amountMinor = raw.amount != null ? toMinorUnits(raw.amount) : undefined
  const probability = raw.probability != null
    ? parseFloat(String(raw.probability))
    : undefined

  // Derive status from sales_stage
  let status: string | undefined
  const stage = raw.sales_stage
  if (stage === 'Closed Won') status = 'won'
  else if (stage === 'Closed Lost') status = 'lost'
  else if (stage != null) status = 'open'

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: amountMinor != null
      ? { amount: amountMinor, currency: (raw.currency_id as string | undefined) ?? 'USD' }
      : undefined,
    stage: stage ?? undefined,
    status,
    company_id: raw.account_id ?? undefined,
    owner_id: raw.assigned_user_id ?? undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    close_date: toIsoDatetime(raw.close_date),
    created_at: toIsoDatetime(raw.date_entered),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = toMajorUnits(data.value.amount)
  if (data.value?.currency !== undefined) out.currency_id = data.value.currency
  if (data.stage !== undefined) out.sales_stage = data.stage
  if (data.probability !== undefined) out.probability = data.probability
  if (data.close_date !== undefined) out.close_date = data.close_date
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
