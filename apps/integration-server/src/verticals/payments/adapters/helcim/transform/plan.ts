/**
 * Helcim payment plan ↔ canonical Plan.
 *
 * The Helcim Recurring API exposes payment plans at `GET /payment-plans` and
 * `GET /payment-plans/{id}`. A plan carries:
 *   id                    — numeric plan id
 *   name                  — unique plan name
 *   description           — plan description
 *   recurringAmount       — decimal dollars charged per billing cycle
 *   setupAmount           — optional one-time setup fee (decimal dollars)
 *   currency              — e.g. "CAD"
 *   billingPeriod         — "daily" | "weekly" | "monthly" | "yearly"
 *   billingPeriodIncrements — integer; periods between charges
 *   freeTrialPeriod       — integer; number of free-trial periods
 *   status                — e.g. "active"
 *   type                  — "subscription" | "cycle"
 *   termType              — "forever" | "expires"
 *   paymentMethod         — "card" | …
 *   dateCreated, dateUpdated — YYYY-MM-DD HH:MM:SS Mountain Time
 *
 * `billingPeriod` maps to the canonical `interval`; `billingPeriodIncrements`
 * maps to `intervalCount`. Amounts are converted decimal-dollars → minor units.
 *
 * Refs:
 *   https://devdocs.helcim.com/docs/recurring-payment-plans
 *   https://devdocs.helcim.com/reference/payment-plan-single
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Plan } from '../../../schema/plan'
import type { BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawHelcimPaymentPlan {
  id?: number | string
  name?: string
  description?: string
  recurringAmount?: number | string
  setupAmount?: number | string
  currency?: string
  billingPeriod?: string
  billingPeriodIncrements?: number | string
  freeTrialPeriod?: number | string
  status?: string
  type?: string
  termType?: string
  paymentMethod?: string
  addOnIds?: unknown[]
  dateCreated?: string
  dateUpdated?: string
  [k: string]: unknown
}

function mapInterval(period: string | undefined): BillingInterval {
  switch ((period ?? '').toLowerCase()) {
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

export function transformPlan(raw: RawHelcimPaymentPlan): Plan {
  const intervalCount =
    raw.billingPeriodIncrements != null ? Number(raw.billingPeriodIncrements) : undefined
  const trialPeriodDays =
    raw.freeTrialPeriod != null ? Number(raw.freeTrialPeriod) : undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name || undefined,
    active: (raw.status ?? '').toLowerCase() === 'active',
    amount: toMinorUnits(raw.recurringAmount),
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw.billingPeriod),
    intervalCount: intervalCount && Number.isFinite(intervalCount) ? intervalCount : undefined,
    trialPeriodDays: trialPeriodDays && Number.isFinite(trialPeriodDays) ? trialPeriodDays : undefined,
    gateway: 'helcim',
    metadata: strMap({
      name: raw.name,
      description: raw.description,
      type: raw.type,
      termType: raw.termType,
      paymentMethod: raw.paymentMethod,
      setupAmount: raw.setupAmount,
    }),
    createdAt: raw.dateCreated ? toIsoDatetime(raw.dateCreated) : undefined,
    updatedAt: raw.dateUpdated ? toIsoDatetime(raw.dateUpdated) : undefined,
    raw,
  }
}
