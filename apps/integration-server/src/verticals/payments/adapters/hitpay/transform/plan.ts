import { toIsoDatetime } from '@opensteward/shared'
import type { Plan, BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A HitPay Subscription Plan — the pricing template for recurring billing.
 * Fetched via `GET /v1/subscription-plan` or `GET /v1/subscription-plan/{id}`.
 *
 * Docs: https://docs.hitpayapp.com/apis/recurring-billing/get-all-plans
 */
export interface RawHitpaySubscriptionPlan {
  id?: string
  name?: string
  description?: string | null
  cycle?: string
  cycle_repeat?: number | null
  cycle_frequency?: string | null
  currency?: string
  amount?: string | number
  reference?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * Map HitPay cycle strings to canonical BillingInterval.
 * HitPay cycles: "daily" | "weekly" | "monthly" | "yearly"
 */
function mapCycle(cycle: string | undefined): BillingInterval {
  switch ((cycle ?? '').toLowerCase()) {
    case 'daily':
      return 'day'
    case 'weekly':
      return 'week'
    case 'monthly':
    case 'month':
      return 'month'
    case 'yearly':
    case 'annual':
    case 'year':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawHitpaySubscriptionPlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    productId: undefined,
    nickname: raw.name ?? undefined,
    active: true,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    interval: mapCycle(raw.cycle),
    intervalCount: raw.cycle_repeat ?? 1,
    trialPeriodDays: 0,
    gateway: 'hitpay',
    metadata: strMap({
      reference: raw.reference,
      cycle_frequency: raw.cycle_frequency,
      description: raw.description,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
