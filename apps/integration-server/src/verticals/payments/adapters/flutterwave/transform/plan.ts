import type { BillingInterval, Plan } from '../../../schema/plan'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawFlutterwavePlan {
  id?: number
  name?: string
  amount?: number
  currency?: string
  interval?: string
  status?: string
  created_at?: string
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
    case 'yearly':
    case 'annually':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawFlutterwavePlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name,
    active: (raw.status ?? '').toLowerCase() === 'active',
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw.interval),
    intervalCount: 1,
    gateway: 'flutterwave',
    metadata: strMap({ interval: raw.interval }),
    createdAt: raw.created_at,
    raw,
  }
}
