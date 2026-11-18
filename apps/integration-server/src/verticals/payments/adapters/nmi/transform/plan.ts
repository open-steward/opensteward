import type { Plan } from '../../../schema/plan'
import { decimalToMinor, parseNmiDatetime, pickCurrency, strMap, xmlTag } from './shared'

/**
 * A normalised NMI recurring plan record, decoded from a Query API
 * `report_type=recurring_plans` `<plan>` block.
 *
 * Field names confirmed from the ZNMI TypeScript wrapper (ZachHandley/ZNMI)
 * which reverse-engineers actual NMI XML payloads. The QueryRecurringPlanSchema
 * defines: plan_id, plan_name, plan_amount, day_frequency, month_frequency,
 * day_of_month, plan_payments.
 *
 * NMI does not ship plan currency in the plan report; it uses the merchant's
 * account currency (defaulting to USD).
 */
export interface RawNmiPlan {
  planId?: string
  planName?: string
  /** Amount in major units ("12.50"). */
  planAmount?: string
  /** Number of payments; "until_cancelled"/"until_canceled" for open-ended plans. */
  planPayments?: string
  /** Frequency in days (mutually exclusive with month_frequency). */
  dayFrequency?: string
  /** Frequency in months (paired with day_of_month). */
  monthFrequency?: string
  /** Day of month for monthly plans. */
  dayOfMonth?: string
  currency?: string
  createdAt?: string
  raw?: unknown
}

/**
 * Map NMI day/month frequency fields to a canonical BillingInterval.
 * day_frequency=7 → week; 1 → day; ~30 → month; ~365 → year.
 * month_frequency=1 → month; =12 → year.
 */
function deriveInterval(raw: RawNmiPlan): 'day' | 'week' | 'month' | 'year' {
  if (raw.dayFrequency) {
    const d = parseInt(raw.dayFrequency, 10)
    if (Number.isFinite(d)) {
      if (d === 1) return 'day'
      if (d === 7) return 'week'
      if (d >= 28 && d <= 31) return 'month'
      if (d >= 364 && d <= 366) return 'year'
    }
    return 'day'
  }
  if (raw.monthFrequency) {
    const m = parseInt(raw.monthFrequency, 10)
    if (Number.isFinite(m) && m === 12) return 'year'
    return 'month'
  }
  return 'month'
}

function deriveIntervalCount(raw: RawNmiPlan): number {
  if (raw.dayFrequency) return parseInt(raw.dayFrequency, 10) || 1
  if (raw.monthFrequency) return parseInt(raw.monthFrequency, 10) || 1
  return 1
}

function deriveTrialDays(_raw: RawNmiPlan): number | undefined {
  // NMI plans don't have a dedicated trial_period_days field; return undefined.
  return undefined
}

export function transformPlan(raw: RawNmiPlan): Plan {
  const interval = deriveInterval(raw)
  return {
    id: String(raw.planId ?? ''),
    externalId: String(raw.planId ?? ''),
    nickname: raw.planName || undefined,
    active: true,
    amount: decimalToMinor(raw.planAmount),
    currency: pickCurrency(raw.currency),
    interval,
    intervalCount: deriveIntervalCount(raw),
    trialPeriodDays: deriveTrialDays(raw),
    gateway: 'nmi',
    metadata: strMap({
      plan_payments: raw.planPayments,
      day_frequency: raw.dayFrequency,
      month_frequency: raw.monthFrequency,
      day_of_month: raw.dayOfMonth,
    }),
    createdAt: parseNmiDatetime(raw.createdAt),
    raw: raw.raw ?? raw,
  }
}

/** Decode one Query API `<plan>` XML block into `RawNmiPlan`. */
export function planFromXml(block: string): RawNmiPlan {
  return {
    planId: xmlTag(block, 'plan_id') ?? xmlTag(block, 'id'),
    planName: xmlTag(block, 'plan_name'),
    planAmount: xmlTag(block, 'plan_amount'),
    planPayments: xmlTag(block, 'plan_payments'),
    dayFrequency: xmlTag(block, 'day_frequency'),
    monthFrequency: xmlTag(block, 'month_frequency'),
    dayOfMonth: xmlTag(block, 'day_of_month'),
    currency: xmlTag(block, 'currency'),
    createdAt: xmlTag(block, 'created'),
    raw: block,
  }
}
