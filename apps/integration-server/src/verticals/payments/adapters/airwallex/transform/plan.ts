/**
 * Airwallex Price → canonical Plan  (derived).
 *
 * Airwallex Billing has no first-class "plan" object. The equivalent concept is
 * a **Price** with a `recurring` field, which defines the billing interval and
 * amount. The canonical Plan schema (amount, currency, interval, intervalCount)
 * maps directly onto the Airwallex Price response.
 *
 * Prices live at `/api/v1/prices` (list) and `/api/v1/prices/{id}` (get).
 * `unit_amount` is in **major units** (same convention as PaymentIntents) and
 * must be scaled to minor units.
 *
 * Billing intervals (period_unit): DAY | WEEK | MONTH | YEAR → canonical
 * BillingInterval: day | week | month | year.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/billing/prices
 *   https://www.airwallex.com/docs/billing/billing-components/prices/prices-via-api
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Plan, BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawAirwallexPriceRecurring {
  period_unit?: string   // DAY | WEEK | MONTH | YEAR
  period?: number        // interval count (default 1)
  billing_type?: string  // IN_ADVANCE | IN_ARREARS
  [k: string]: unknown
}

export interface RawAirwallexPrice {
  id?: string
  product_id?: string
  currency?: string
  unit_amount?: number      // major units (e.g. 9.99 = $9.99)
  flat_amount?: number      // major units (alternative pricing model)
  active?: boolean
  recurring?: RawAirwallexPriceRecurring
  pricing_model?: string    // PER_UNIT | FLAT
  description?: string
  nickname?: string         // optional label
  trial_period_days?: number
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapInterval(periodUnit: string | undefined): BillingInterval {
  switch ((periodUnit ?? '').toUpperCase()) {
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

export function transformPlan(raw: RawAirwallexPrice): Plan {
  const amount =
    toMinorUnits(raw.unit_amount) ?? toMinorUnits(raw.flat_amount) ?? 0
  const recurring = raw.recurring ?? {}

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    productId: raw.product_id ?? undefined,
    nickname: raw.nickname ?? raw.description ?? undefined,
    active: typeof raw.active === 'boolean' ? raw.active : undefined,
    amount,
    currency: pickCurrency(raw.currency),
    interval: mapInterval(recurring.period_unit),
    intervalCount:
      typeof recurring.period === 'number' && recurring.period >= 1
        ? recurring.period
        : 1,
    trialPeriodDays:
      typeof raw.trial_period_days === 'number' ? raw.trial_period_days : undefined,
    gateway: 'airwallex',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
