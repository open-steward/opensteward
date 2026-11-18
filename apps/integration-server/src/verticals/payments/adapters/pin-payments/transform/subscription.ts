import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

/**
 * Pin Payments Subscription object.
 * GET /subscriptions → paginated list of subscriptions.
 * GET /subscriptions/{sub-token} → single subscription.
 *
 * Confirmed fields from https://pinpayments.com/developers/api-reference/subscriptions
 */
export interface RawPinSubscription {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): SubscriptionStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'trial') return 'trialing'
  if (v === 'active') return 'active'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  if (v === 'past_due') return 'past_due'
  if (v === 'paused') return 'paused'
  return 'incomplete'
}

export function transformSubscription(raw: RawPinSubscription): Subscription {
  // plan may be a nested object or a separate plan_token field
  const plan = raw['plan'] as Record<string, unknown> | undefined
  const currency = pickCurrency(
    (plan?.['currency'] ?? raw['currency']) as string | undefined,
    'AUD',
  )

  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    customerId: String(raw['customer_token'] ?? ''),
    status: mapStatus(raw['state'] as string | undefined),
    currency,
    items: [],  // Pin subscriptions are 1-plan-per-subscription; no items array
    currentPeriodStart:
      raw['active_interval_started_at'] != null
        ? String(raw['active_interval_started_at'])
        : undefined,
    currentPeriodEnd:
      raw['active_interval_finishes_at'] != null
        ? String(raw['active_interval_finishes_at'])
        : undefined,
    cancelledAt:
      raw['cancelled_at'] != null ? String(raw['cancelled_at']) : undefined,
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
