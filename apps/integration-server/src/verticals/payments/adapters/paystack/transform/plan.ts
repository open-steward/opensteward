import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

export interface RawPaystackPlan {
  id?: number
  plan_code?: string
  name?: string
  amount?: number
  interval?: string
  currency?: string
  is_deleted?: boolean
  is_archived?: boolean
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

function mapInterval(raw: string | undefined): BillingInterval {
  switch ((raw ?? '').toLowerCase()) {
    case 'daily':
      return 'day'
    case 'weekly':
      return 'week'
    case 'monthly':
      return 'month'
    case 'annually':
    case 'biannually':
    case 'yearly':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawPaystackPlan): Plan {
  return {
    id: String(raw.id ?? raw.plan_code ?? ''),
    externalId: String(raw.plan_code ?? raw.id ?? ''),
    nickname: raw.name,
    active: !(raw.is_deleted ?? false) && !(raw.is_archived ?? false),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw.interval),
    intervalCount: 1,
    gateway: 'paystack',
    metadata: strMap({ interval: raw.interval }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
