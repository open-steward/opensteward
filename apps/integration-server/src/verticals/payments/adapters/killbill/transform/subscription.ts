import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { requireId, str } from './shared'

/**
 * Subscription resource (https://killbill.github.io/slate/subscription.html):
 * accountId, bundleId, subscriptionId, startDate, productName, phaseType
 * ("TRIAL, DISCOUNT, FIXEDTERM, or EVERGREEN"), planName, state ("PENDING ...
 * ACTIVE ... BLOCKED: The subscription is currently paused. CANCELLED ...
 * EXPIRED"), cancelledDate, chargedThroughDate, quantity.
 */
export interface RawKillbillSubscription {
  accountId?: string
  bundleId?: string
  subscriptionId?: string
  startDate?: string | null
  productName?: string | null
  phaseType?: string | null
  planName?: string | null
  state?: string | null
  cancelledDate?: string | null
  quantity?: number | null
  [k: string]: unknown
}

/** Bundle (https://killbill.github.io/slate/bundle.html): carries a `subscriptions` array. */
export interface RawKillbillBundle {
  bundleId?: string
  accountId?: string
  subscriptions?: RawKillbillSubscription[] | null
  [k: string]: unknown
}

function mapStatus(state: unknown, phaseType: unknown): SubscriptionStatus {
  switch (state) {
    case 'ACTIVE':
      return phaseType === 'TRIAL' ? 'trialing' : 'active'
    case 'PENDING':
      return 'incomplete'
    case 'BLOCKED':
      return 'paused'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'unknown'
  }
}

export function transformSubscription(raw: RawKillbillSubscription): Subscription {
  const id = requireId(raw.subscriptionId, 'subscriptionId', 'subscription')
  const customerId = requireId(raw.accountId, 'accountId', 'subscription')
  const planName = str(raw.planName)
  const productName = str(raw.productName)
  const quantity =
    typeof raw.quantity === 'number' && Number.isInteger(raw.quantity) && raw.quantity >= 0
      ? raw.quantity
      : undefined
  return {
    id,
    externalId: id,
    customerId,
    status: mapStatus(raw.state, raw.phaseType),
    items: [
      {
        id,
        ...(planName ? { priceId: planName } : {}),
        ...(productName ? { productId: productName } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
      },
    ],
    // cancelledDate is "Datetime when the service stopped, or will stop": it
    // is past only once state is CANCELLED ("has been cancelled"); otherwise
    // it is a scheduled stop.
    ...(raw.state === 'CANCELLED'
      ? { cancelledAt: toIsoDatetime(raw.cancelledDate) }
      : { cancelAt: toIsoDatetime(raw.cancelledDate) }),
    gateway: 'killbill',
    metadata: {},
    createdAt: toIsoDatetime(raw.startDate),
    raw,
  }
}

/** The subscriptions of one bundle, in the bundle's own order. */
export function subscriptionsOf(bundle: RawKillbillBundle): Subscription[] {
  return (bundle.subscriptions ?? []).map(transformSubscription)
}
