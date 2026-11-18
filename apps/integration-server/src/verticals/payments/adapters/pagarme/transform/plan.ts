/**
 * Pagar.me v5 plan transform.
 *
 * Endpoint: GET /plans, GET /plans/{id}
 * Plans are first-class resources that define recurring billing templates.
 *
 * The canonical `Plan` maps straightforwardly: the amount comes from the
 * plan's first item's `pricing_scheme.price` (centavos), or from the plan's
 * own `minimum_price` field when no items are present. The interval fields
 * (`interval` / `interval_count`) come directly from the plan object.
 *
 * Money is in centavos (minor units). Timestamps are ISO-8601 strings.
 *
 * Refs:
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-plan-response.md
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-plan-item-response.md
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-pricing-scheme-response.md
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Plan } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

export interface RawPagarmePlanItem {
  id?: string
  name?: string
  status?: string
  quantity?: number
  pricing_scheme?: {
    price?: number
    scheme_type?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface RawPagarmePlan {
  id?: string
  name?: string
  description?: string
  url?: string
  statement_descriptor?: string
  interval?: string
  interval_count?: number
  billing_type?: string
  payment_methods?: string[]
  status?: string
  currency?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string
  items?: RawPagarmePlanItem[]
  trial_period_days?: number
  minimum_price?: number
  metadata?: Record<string, string>
  [k: string]: unknown
}

/**
 * Map Pagar.me billing interval to canonical BillingInterval.
 */
function mapInterval(
  interval: string | undefined,
): 'day' | 'week' | 'month' | 'year' {
  switch ((interval ?? '').toLowerCase()) {
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

/**
 * Derive the plan amount from the first item's pricing_scheme, falling back
 * to the plan's minimum_price, then 0.
 */
function pickAmount(raw: RawPagarmePlan): number {
  const firstItem = (raw.items ?? [])[0]
  if (firstItem?.pricing_scheme?.price != null) {
    return firstItem.pricing_scheme.price
  }
  return raw.minimum_price ?? 0
}

export function transformPlan(raw: RawPagarmePlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name ?? undefined,
    active: (raw.status ?? '').toLowerCase() === 'active',
    amount: pickAmount(raw),
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw.interval),
    intervalCount: raw.interval_count ?? 1,
    trialPeriodDays: raw.trial_period_days ?? 0,
    gateway: 'pagarme',
    metadata: strMap({
      ...raw.metadata,
      description: raw.description,
      billing_type: raw.billing_type,
      statement_descriptor: raw.statement_descriptor,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.deleted_at),
    raw,
  }
}
