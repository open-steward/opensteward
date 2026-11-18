/**
 * Paddle Price → canonical Plan.
 *
 * Paddle Billing uses "Price" as its subscription-pricing primitive (what
 * other gateways call "Plan"). Prices are linked to a Paddle Product, carry
 * a billing frequency (`billing_cycle: { interval, frequency }`), and store
 * the unit amount as a string of integer minor units (e.g. "1000" = $10.00).
 *
 * Mapping:
 *   Price.id           → Plan.id / externalId
 *   Price.product_id   → Plan.productId
 *   Price.name         → Plan.nickname
 *   Price.status       → Plan.active (active = true)
 *   Price.unit_price   → Plan.amount  (already minor units as string)
 *   Price.currency_code→ Plan.currency
 *   Price.billing_cycle.interval  → Plan.interval  (day|week|month|year)
 *   Price.billing_cycle.frequency → Plan.intervalCount
 *   Price.trial_period.interval   → Plan.trialPeriodDays (converted to days)
 *
 * Docs: https://developer.paddle.com/api-reference/prices/overview
 */
import type { Plan, BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, strToMinor } from './shared'

export interface RawPaddlePrice {
  id?: string
  product_id?: string
  name?: string | null
  status?: string
  unit_price?: { amount?: string; currency_code?: string } | null
  currency_code?: string
  billing_cycle?: { interval?: string; frequency?: number } | null
  trial_period?: { interval?: string; frequency?: number } | null
  custom_data?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapInterval(raw: string | null | undefined): BillingInterval {
  switch ((raw ?? '').toLowerCase()) {
    case 'day':
      return 'day'
    case 'week':
      return 'week'
    case 'month':
      return 'month'
    case 'year':
      return 'year'
    default:
      return 'month'
  }
}

/** Convert a trial period expressed in arbitrary units to days. */
function trialToDays(period: { interval?: string; frequency?: number } | null | undefined): number | undefined {
  if (!period) return undefined
  const freq = period.frequency ?? 1
  switch ((period.interval ?? '').toLowerCase()) {
    case 'day':
      return freq
    case 'week':
      return freq * 7
    case 'month':
      return freq * 30
    case 'year':
      return freq * 365
    default:
      return undefined
  }
}

export function transformPlan(raw: RawPaddlePrice): Plan {
  const currency = pickCurrency(
    raw.unit_price?.currency_code ?? raw.currency_code,
  )
  const amount = strToMinor(raw.unit_price?.amount)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    productId: raw.product_id ?? undefined,
    nickname: raw.name ?? undefined,
    active: (raw.status ?? '').toLowerCase() === 'active',
    amount,
    currency,
    interval: mapInterval(raw.billing_cycle?.interval),
    intervalCount: raw.billing_cycle?.frequency ?? 1,
    trialPeriodDays: trialToDays(raw.trial_period),
    gateway: 'paddle',
    metadata: strMap({ ...raw.custom_data }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
