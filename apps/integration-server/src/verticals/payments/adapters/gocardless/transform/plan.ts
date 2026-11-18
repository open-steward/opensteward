/**
 * GoCardless doesn't expose a first-class Plan resource; the subscription
 * itself carries pricing. We synthesise a Plan from a Subscription for
 * canonical schema completeness.
 */
import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

export interface RawGCSubscriptionAsPlan {
  id?: string
  name?: string
  amount?: number
  currency?: string
  interval?: number
  interval_unit?: string
  created_at?: string
  [k: string]: unknown
}

function unitToInterval(u: string | undefined): BillingInterval {
  switch ((u ?? '').toLowerCase()) {
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

export function transformPlan(raw: RawGCSubscriptionAsPlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    interval: unitToInterval(raw.interval_unit),
    intervalCount: raw.interval,
    gateway: 'gocardless',
    metadata: strMap({}),
    createdAt: raw.created_at,
    raw,
  }
}
