import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

/**
 * A Bolt subscription object from GET /v1/subscriptions or
 * GET /v1/subscriptions/{ID}.
 *
 * Docs: https://help.bolt.com/products/bolt-subscriptions/subscriptions-implementation/
 */
export interface RawBoltSubscription {
  id?: string
  created_at?: string
  updated_at?: string
  /** Bolt shopper / account identifier. */
  consumer_id?: string
  subscription_plan_id?: string
  quantity?: number
  status?: string
  /** Nested plan object (embedded in the list/get response). */
  plan?: {
    id?: string
    name?: string
    created_at?: string
    updated_at?: string
    frequency?: number
    product_id?: string
    frequency_unit?: string
    unit_price?: number
    [k: string]: unknown
  }
  [k: string]: unknown
}

function mapStatus(status: string | undefined): SubscriptionStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'paused':
      return 'paused'
    case 'past_due':
      return 'past_due'
    case 'trialing':
      return 'trialing'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawBoltSubscription): Subscription {
  const plan = raw.plan

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.consumer_id ?? ''),
    status: mapStatus(raw.status),
    currency: plan?.unit_price != null ? pickCurrency(undefined) : pickCurrency(undefined),
    items:
      plan != null
        ? [
            {
              id: String(raw.subscription_plan_id ?? plan.id ?? ''),
              productId: plan.product_id ? String(plan.product_id) : undefined,
              quantity: typeof raw.quantity === 'number' ? raw.quantity : undefined,
              amount: typeof plan.unit_price === 'number' ? plan.unit_price : undefined,
            },
          ]
        : [],
    gateway: 'bolt',
    metadata: strMap({
      subscription_plan_id: raw.subscription_plan_id,
      plan_name: plan?.name,
      frequency: plan?.frequency,
      frequency_unit: plan?.frequency_unit,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
