import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickStr, requireCurrency, requireMinor, strMap, toIsoDatetime } from './shared'

/**
 * Rapyd Plan object, as List Plans / Retrieve Plan document it
 * (https://docs.rapyd.net/en/list-plans.html,
 * https://docs.rapyd.net/en/retrieve-plan.html). Only the documented fields
 * this transform reads are typed.
 *
 *   amount          "The amount to charge, in units of the currency defined in
 *                   currency. Relevant when billing_scheme is set to per_unit."
 *   billing_scheme  per_unit | tiered
 *   interval        day | week | month | year
 *   product         "Describes this product in the plan." (an object with `id`
 *                   in the documented example)
 */
export interface RawRapydPlan {
  id?: string
  product?: { id?: string } | null
  nickname?: string
  active?: boolean
  amount?: number | string
  billing_scheme?: string
  currency?: string
  interval?: string
  interval_count?: number
  trial_period_days?: number
  created_at?: number | string
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

function mapInterval(interval: unknown, id: string): BillingInterval {
  if (interval === 'day' || interval === 'week' || interval === 'month' || interval === 'year') {
    return interval
  }
  throw new Error(`Rapyd plan ${id} has no documented interval (got ${String(interval)})`)
}

export function transformPlan(raw: RawRapydPlan): Plan {
  const id = pickStr(raw.id)
  if (!id) throw new Error('Rapyd plan has no id')
  // `amount` is documented only for per_unit plans; a tiered plan carries its
  // price in `tiers`, which the canonical Plan (one flat amount) cannot hold.
  // The documented tiered example reports `amount: 0`, which is not its price.
  if (raw.billing_scheme !== 'per_unit') {
    throw new Error(
      `Rapyd plan ${id} has billing_scheme ${String(raw.billing_scheme)}: amount is "Relevant when billing_scheme is set to per_unit" only`,
    )
  }
  const currency = requireCurrency(raw.currency, `plan ${id}`)
  return {
    id,
    externalId: id,
    productId: pickStr(raw.product?.id),
    nickname: pickStr(raw.nickname),
    active: typeof raw.active === 'boolean' ? raw.active : undefined,
    amount: requireMinor(raw.amount, currency, `plan ${id}`),
    currency,
    interval: mapInterval(raw.interval, id),
    intervalCount:
      typeof raw.interval_count === 'number' && raw.interval_count >= 1
        ? raw.interval_count
        : undefined,
    trialPeriodDays:
      typeof raw.trial_period_days === 'number' && raw.trial_period_days >= 0
        ? raw.trial_period_days
        : undefined,
    gateway: 'rapyd',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
