import type { Plan, BillingInterval } from '../../../schema/plan'
import { requireId, str, toMinor } from './shared'

/**
 * PlanDetail from GET /1.0/kb/catalog/availableBasePlans
 * (https://killbill.github.io/slate/catalog.html, "Retrieve available base
 * plans"): product, plan, priceList, finalPhaseBillingPeriod,
 * finalPhaseRecurringPrice [{ currency, value }].
 */
export interface RawKillbillPlanDetail {
  product?: string
  plan?: string
  priceList?: string
  finalPhaseBillingPeriod?: string
  finalPhaseRecurringPrice?: Array<{ currency?: string; value?: number }> | null
  [k: string]: unknown
}

/**
 * BillingPeriod, as killbill-api defines it (linked from the docs' "See
 * BillingPeriod"): https://github.com/killbill/killbill-api/blob/master/src/main/java/org/killbill/billing/catalog/api/BillingPeriod.java
 * NO_BILLING_PERIOD (Period.ZERO) has no recurring interval.
 */
const PERIODS: Record<string, { interval: BillingInterval; intervalCount: number }> = {
  DAILY: { interval: 'day', intervalCount: 1 },
  WEEKLY: { interval: 'week', intervalCount: 1 },
  BIWEEKLY: { interval: 'week', intervalCount: 2 },
  THIRTY_DAYS: { interval: 'day', intervalCount: 30 },
  THIRTY_ONE_DAYS: { interval: 'day', intervalCount: 31 },
  SIXTY_DAYS: { interval: 'day', intervalCount: 60 },
  NINETY_DAYS: { interval: 'day', intervalCount: 90 },
  MONTHLY: { interval: 'month', intervalCount: 1 },
  BIMESTRIAL: { interval: 'month', intervalCount: 2 },
  QUARTERLY: { interval: 'month', intervalCount: 3 },
  TRIANNUAL: { interval: 'month', intervalCount: 4 },
  BIANNUAL: { interval: 'month', intervalCount: 6 },
  ANNUAL: { interval: 'year', intervalCount: 1 },
  SESQUIENNIAL: { interval: 'month', intervalCount: 18 },
  BIENNIAL: { interval: 'year', intervalCount: 2 },
  TRIENNIAL: { interval: 'year', intervalCount: 3 },
}

/** Canonical id of one (plan, currency) price: a Kill Bill plan carries one recurring price per currency. */
export function planId(planName: string, currency: string): string {
  return `${planName}:${currency}`
}

/**
 * One canonical Plan per currency of the plan's final-phase recurring price.
 * A plan with NO_BILLING_PERIOD (or none) has no recurring interval and
 * yields none.
 */
export function transformPlanDetail(raw: RawKillbillPlanDetail): Plan[] {
  const name = requireId(raw.plan, 'plan', 'plan detail')
  const period = PERIODS[raw.finalPhaseBillingPeriod ?? '']
  if (!period) return []
  const out: Plan[] = []
  for (const price of raw.finalPhaseRecurringPrice ?? []) {
    const currency = str(price.currency)?.toUpperCase()
    if (!currency) continue
    const amount = toMinor(price.value, currency)
    if (amount === undefined) continue
    out.push({
      id: planId(name, currency),
      externalId: name,
      ...(str(raw.product) ? { productId: raw.product as string } : {}),
      amount,
      currency,
      interval: period.interval,
      intervalCount: period.intervalCount,
      gateway: 'killbill',
      metadata: str(raw.priceList) ? { priceList: raw.priceList as string } : {},
      raw,
    })
  }
  return out
}
