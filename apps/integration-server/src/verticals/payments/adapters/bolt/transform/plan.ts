import { toIsoDatetime } from '@opensteward/shared'
import type { Plan } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

/**
 * A Bolt subscription plan, embedded in a product from
 * GET /v1/subscriptions/products or GET /v1/subscriptions/products/{ID}.
 *
 * Bolt plans live inside the `plans` array on a product object. We flatten
 * one plan at a time for the canonical Plan record.
 *
 * Docs: https://help.bolt.com/products/bolt-subscriptions/subscriptions-implementation/
 */
export interface RawBoltPlan {
  id?: string
  name?: string
  created_at?: string
  updated_at?: string
  /** Number of interval units between billing cycles. */
  frequency?: number
  /** Parent product ID. */
  product_id?: string
  /** Billing interval unit: "month" | "year" (Bolt doesn't expose "day"/"week"). */
  frequency_unit?: string
  /** Price per cycle in minor units (cents). */
  unit_price?: number
  images?: string[]
  checkout_link?: string
  [k: string]: unknown
}

/**
 * A Bolt subscription product from GET /v1/subscriptions/products.
 * Plans are embedded under `plans`.
 */
export interface RawBoltProduct {
  id?: string
  name?: string
  description?: string
  created_at?: string
  updated_at?: string
  brand?: string
  sku?: string
  images?: string[]
  plans?: RawBoltPlan[]
  [k: string]: unknown
}

/**
 * Map Bolt's `frequency_unit` to the canonical BillingInterval enum.
 * Bolt only documents "month" and "year"; anything else falls back to "month".
 */
function mapInterval(unit: string | undefined): Plan['interval'] {
  switch ((unit ?? '').toLowerCase()) {
    case 'year':
      return 'year'
    case 'week':
      return 'week'
    case 'day':
      return 'day'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawBoltPlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    nickname: raw.name ? String(raw.name) : undefined,
    active: true,
    amount: typeof raw.unit_price === 'number' ? raw.unit_price : 0,
    currency: pickCurrency(undefined),
    interval: mapInterval(raw.frequency_unit),
    intervalCount: typeof raw.frequency === 'number' ? raw.frequency : undefined,
    gateway: 'bolt',
    metadata: strMap({ checkout_link: raw.checkout_link }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
