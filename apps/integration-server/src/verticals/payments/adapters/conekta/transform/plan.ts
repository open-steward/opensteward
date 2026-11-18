/**
 * Conekta `Plan` — available at `GET /plans` and `GET /plans/{id}`. Plans are
 * first-class subscription billing records with amount, currency, billing
 * interval, frequency, and optional trial days. Amounts are in centavos (minor
 * units already). Timestamps are Unix epoch seconds.
 *
 * The `interval` field values: `day`, `week`, `month`, `year`.
 * The `frequency` field is the interval count (e.g. 1 for monthly, 3 for
 * quarterly).
 *
 * Refs:
 *   https://developers.conekta.com/reference/getplans
 *   https://developers.conekta.com/reference/getplan
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Plan } from '../../../schema/plan'
import type { BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

export interface RawConektaPlan {
  id?: string
  object?: string
  name?: string
  amount?: number
  currency?: string
  interval?: string
  /** Number of billing intervals per cycle (e.g. 1 = every 1 month). */
  frequency?: number
  trial_period_days?: number
  expiry_count?: number
  max_retries?: number
  retry_delay_hours?: number
  livemode?: boolean
  created_at?: number
  [k: string]: unknown
}

function mapInterval(raw: RawConektaPlan): BillingInterval {
  switch ((raw.interval ?? '').toLowerCase()) {
    case 'day':
      return 'day'
    case 'week':
      return 'week'
    case 'year':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawConektaPlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name,
    active: true,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw),
    intervalCount: raw.frequency ?? 1,
    trialPeriodDays: raw.trial_period_days ?? undefined,
    gateway: 'conekta',
    metadata: strMap({ livemode: raw.livemode, expiry_count: raw.expiry_count }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
