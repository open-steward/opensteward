/**
 * IntaSend subscription plans (`/api/v1/subscriptions-plans/`).
 *
 * A plan defines the billing schedule and maps onto the canonical **Plan**.
 * Fields are read from the documented PlanSer (OpenAPI "IntaSend API" 1.0.1):
 *
 *   "required":["amount","created_at","currency","frequency","name","plan_id","plan_url","updated_at"]
 *   "amount":{"type":"string","format":"decimal","pattern":"^-?\\d{0,13}(?:\\.\\d{0,2})?$"}
 *   "CurrencyEnum":{"type":"string","enum":["KES","GHS","NGN","UGX","TZS","XAF","XOF"],"description":"Supported currencies:...
 *   "FrequencyUnitEnum":{"enum":["D","W","M","Y"],"type":"string","description":"* `D` - day\n* `W` - week\n* `M` - month\n* `Y` - year"
 *
 * Field mapping:
 *   plan_id         → id / externalId (required; a record without it throws)
 *   name            → nickname
 *   amount          → amount (major-unit decimal → minor units by the currency's exponent)
 *   currency        → currency (required; never defaulted)
 *   frequency_unit  → interval (D/W/M/Y; anything else throws)
 *   frequency       → intervalCount (omitted when 0, below the canonical minimum of 1)
 *   billing_cycles  → metadata.billing_cycles ("How many times should we bill the customer")
 *   reference, redirect_url → metadata
 *
 * PlanSer documents no active flag, so `active` stays unset.
 *
 * Refs:
 *   https://developers.intasend.com/reference/api_v1_subscriptions_plans_list
 *   https://developers.intasend.com/docs/create-a-subscription-plan
 */
import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Plan, BillingInterval } from '../../../schema/plan'
import { strMap } from './shared'

export interface RawIntasendPlan {
  plan_id?: string
  name?: string | null
  frequency?: number | null
  frequency_unit?: string | null
  billing_cycles?: number | null
  currency?: string | null
  amount?: string | null
  reference?: string | null
  plan_url?: string | null
  redirect_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

const INTERVALS: Record<string, BillingInterval> = {
  D: 'day',
  W: 'week',
  M: 'month',
  Y: 'year',
}

export function transformPlan(raw: RawIntasendPlan): Plan {
  if (!raw.plan_id) throw new Error('IntaSend plan has no plan_id')
  const id = raw.plan_id

  if (!raw.currency) throw new Error(`IntaSend plan ${id} has no currency`)
  const currency = raw.currency

  const major = raw.amount == null || raw.amount === '' ? undefined : Number(raw.amount)
  const amount = majorToMinor(major, currency)
  if (amount === undefined) throw new Error(`IntaSend plan ${id} has no amount`)

  const interval = INTERVALS[raw.frequency_unit ?? '']
  if (!interval) {
    throw new Error(`IntaSend plan ${id} has an undocumented frequency_unit ${raw.frequency_unit}`)
  }

  return {
    id,
    externalId: id,
    nickname: raw.name ?? undefined,
    amount,
    currency,
    interval,
    intervalCount: raw.frequency != null && raw.frequency >= 1 ? raw.frequency : undefined,
    gateway: 'intasend',
    metadata: strMap({
      billing_cycles: raw.billing_cycles,
      reference: raw.reference,
      redirect_url: raw.redirect_url,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
