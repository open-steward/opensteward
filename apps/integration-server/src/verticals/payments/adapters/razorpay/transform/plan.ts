import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpayPlan {
  id?: string
  period?: string
  interval?: number
  item?: { id?: string; name?: string; amount?: number; currency?: string; description?: string }
  notes?: Record<string, unknown>
  created_at?: number
  [k: string]: unknown
}

function periodToInterval(p: string | undefined): BillingInterval {
  switch ((p ?? '').toLowerCase()) {
    case 'daily':
      return 'day'
    case 'weekly':
      return 'week'
    case 'yearly':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawRazorpayPlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    productId: raw.item?.id,
    nickname: raw.item?.name,
    amount: raw.item?.amount ?? 0,
    currency: pickCurrency(raw.item?.currency),
    interval: periodToInterval(raw.period),
    intervalCount: raw.interval,
    gateway: 'razorpay',
    metadata: strMap({ ...raw.notes, description: raw.item?.description }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
