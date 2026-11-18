/**
 * Finix `SubscriptionPlan` ↔ canonical `Plan`.
 *
 * A Finix SubscriptionPlan is a reusable billing template with a fixed
 * amount and billing interval. Plans can be ACTIVE or INACTIVE.
 *
 * Endpoints:
 *   GET /subscription_plans                         — list
 *   GET /subscription_plans/{subscription_plan_id}  — fetch one
 *
 * Finix billing_interval values (DAILY / WEEKLY / BIWEEKLY / MONTHLY /
 * BIMONTHLY / QUARTERLY / SEMIYEARLY / YEARLY / BIYEARLY / TRIYEARLY) are
 * mapped to the canonical BillingInterval enum (day / week / month / year).
 * Non-primary intervals are approximated to the nearest canonical value.
 *
 * Docs: https://docs.finix.com/api/subscription-plans
 */
import type { Plan } from '../../../schema/plan'
import type { BillingInterval } from '../../../schema/plan'
import { iso, pickCurrency, strMap } from './shared'

export interface RawFinixSubscriptionPlan {
  id?: string
  application_id?: string | null
  linked_to?: string | null
  linked_type?: string | null
  billing_interval?: string | null
  nickname?: string | null
  plan_name?: string | null
  description?: string | null
  amount?: number | null
  currency?: string | null
  default_total_billing_intervals?: number | null
  duration_type?: string | null
  billing_defaults?: {
    collection_method?: string | null
    send_invoice?: boolean | null
    send_receipt?: boolean | null
  } | null
  trial_defaults?: {
    interval_type?: string | null
    interval_count?: number | null
  } | null
  discount_phase_defaults?: {
    amount?: number | null
    billing_interval_count?: number | null
  } | null
  state?: string | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapInterval(v: string | null | undefined): BillingInterval {
  switch ((v ?? '').toUpperCase()) {
    case 'DAILY':
      return 'day'
    case 'WEEKLY':
    case 'BIWEEKLY':
      return 'week'
    case 'MONTHLY':
    case 'BIMONTHLY':
    case 'QUARTERLY':
    case 'SEMIYEARLY':
      return 'month'
    case 'YEARLY':
    case 'BIYEARLY':
    case 'TRIYEARLY':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawFinixSubscriptionPlan): Plan {
  const trialIntervalDays =
    raw.trial_defaults?.interval_count != null
      ? raw.trial_defaults.interval_count *
        ({'DAY': 1, 'WEEK': 7, 'MONTH': 30, 'YEAR': 365}[
          (raw.trial_defaults.interval_type ?? '').toUpperCase()
        ] ?? 1)
      : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.plan_name ?? raw.nickname ?? undefined,
    active: (raw.state ?? '').toUpperCase() === 'ACTIVE',
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw.billing_interval),
    intervalCount: 1,
    trialPeriodDays: trialIntervalDays !== undefined ? Math.round(trialIntervalDays) : undefined,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      description: raw.description,
      linked_to: raw.linked_to,
      linked_type: raw.linked_type,
      billing_interval: raw.billing_interval,
      duration_type: raw.duration_type,
      default_total_billing_intervals: raw.default_total_billing_intervals,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
