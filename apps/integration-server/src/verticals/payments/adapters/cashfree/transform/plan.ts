import type { Plan } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Cashfree Plan entity (`GET /plans/{plan_id}`).
 *
 * Plans are the billing templates used by Cashfree Subscriptions. Each plan
 * defines the recurring amount, interval, and maximum cycles.
 *
 * Cashfree does not expose a "list plans" endpoint — plans are fetched
 * individually by `plan_id`.
 */
export interface RawCashfreePlan {
  plan_id?: string
  plan_name?: string
  plan_note?: string | null
  plan_type?: string
  plan_status?: string
  plan_recurring_amount?: number | string
  plan_max_amount?: number | string | null
  plan_currency?: string
  plan_interval_type?: string
  plan_intervals?: number
  plan_max_cycles?: number | null
  [k: string]: unknown
}

function mapInterval(
  raw: string | undefined,
): 'day' | 'week' | 'month' | 'year' {
  switch ((raw ?? '').toUpperCase()) {
    case 'DAY':
      return 'day'
    case 'WEEK':
      return 'week'
    case 'YEAR':
      return 'year'
    case 'MONTH':
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawCashfreePlan): Plan {
  const id = String(raw.plan_id ?? '')

  return {
    id,
    externalId: id,
    nickname: raw.plan_name ?? undefined,
    active: raw.plan_status?.toUpperCase() === 'ACTIVE',
    amount: toMinorUnits(raw.plan_recurring_amount),
    currency: pickCurrency(raw.plan_currency),
    interval: mapInterval(raw.plan_interval_type),
    intervalCount: typeof raw.plan_intervals === 'number' ? raw.plan_intervals : undefined,
    gateway: 'cashfree',
    metadata: strMap({
      plan_type: raw.plan_type,
      plan_note: raw.plan_note,
      plan_max_cycles: raw.plan_max_cycles,
      plan_max_amount: raw.plan_max_amount,
    }),
    raw,
  }
}
