/**
 * Mercado Pago `preapproval_plan` records back the canonical Plan resource.
 */
import type { BillingInterval, Plan } from '../../../schema/plan'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMPPreapprovalPlan {
  id?: string
  reason?: string
  status?: string
  auto_recurring?: {
    transaction_amount?: number
    currency_id?: string
    frequency?: number
    frequency_type?: string
    repetitions?: number
  }
  date_created?: string
  last_modified?: string
  [k: string]: unknown
}

function unitToInterval(unit: string | undefined): BillingInterval {
  switch ((unit ?? '').toLowerCase()) {
    case 'days':
      return 'day'
    case 'weeks':
      return 'week'
    case 'years':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawMPPreapprovalPlan): Plan {
  const ar = raw.auto_recurring ?? {}
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.reason,
    active: raw.status === 'active',
    amount: decimalToMinor(ar.transaction_amount),
    currency: pickCurrency(ar.currency_id),
    interval: unitToInterval(ar.frequency_type),
    intervalCount: ar.frequency,
    gateway: 'mercado-pago',
    metadata: strMap({ repetitions: ar.repetitions }),
    createdAt: raw.date_created,
    updatedAt: raw.last_modified,
    raw,
  }
}
