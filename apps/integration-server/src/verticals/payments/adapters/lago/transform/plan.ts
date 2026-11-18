/**
 * Lago Plan ↔ canonical Plan.
 *
 * Lago addresses plans by their human `code`, so we surface `code` as both
 * `id` and `externalId`. The recurring `interval` is one of weekly / monthly /
 * quarterly / yearly; the canonical `BillingInterval` has no `quarter`, so a
 * quarterly Lago plan is normalised to a 3-month interval (`month` ×
 * `intervalCount: 3`). Amount is integer cents in `amount_cents` with currency
 * in `amount_currency`. `trial_period` is a day count (may be fractional).
 *
 * Docs: https://getlago.com/docs/api-reference/plans/plan-object
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

export interface RawLagoPlan {
  lago_id?: string
  name?: string | null
  invoice_display_name?: string | null
  code?: string
  interval?: string | null
  description?: string | null
  amount_cents?: number
  amount_currency?: string | null
  trial_period?: number | null
  pay_in_advance?: boolean
  bill_charges_monthly?: boolean
  created_at?: string
  [k: string]: unknown
}

function mapInterval(raw: RawLagoPlan): { interval: BillingInterval; intervalCount?: number } {
  switch ((raw.interval ?? '').toLowerCase()) {
    case 'weekly':
      return { interval: 'week' }
    case 'monthly':
      return { interval: 'month' }
    case 'quarterly':
      // Canonical BillingInterval has no quarter — express as 3 months.
      return { interval: 'month', intervalCount: 3 }
    case 'yearly':
      return { interval: 'year' }
    default:
      return { interval: 'month' }
  }
}

export function transformPlan(raw: RawLagoPlan): Plan {
  const id = String(raw.code ?? raw.lago_id ?? '')
  const { interval, intervalCount } = mapInterval(raw)
  return {
    id,
    externalId: id,
    nickname: raw.invoice_display_name ?? raw.name ?? undefined,
    active: true,
    amount: raw.amount_cents ?? 0,
    currency: pickCurrency(raw.amount_currency) ?? 'USD',
    interval,
    intervalCount,
    trialPeriodDays:
      typeof raw.trial_period === 'number' ? Math.round(raw.trial_period) : undefined,
    gateway: 'lago',
    metadata: strMap({
      code: raw.code,
      description: raw.description,
      pay_in_advance: raw.pay_in_advance,
      lago_id: raw.lago_id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
