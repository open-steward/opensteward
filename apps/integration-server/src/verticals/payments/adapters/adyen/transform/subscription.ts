import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

/**
 * Adyen surfaces "subscriptions" through `RecurringContract` notifications.
 * No bulk-list endpoint exists; consumers reconstruct state from webhook
 * deliveries.
 */
export interface RawAdyenRecurringContract {
  recurringDetailReference?: string
  shopperReference?: string
  contractType?: string
  amount?: { value?: number; currency?: string }
  variant?: string
  creationDate?: string
  expiryDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAdyenRecurringContract): SubscriptionStatus {
  if (raw.expiryDate && new Date(raw.expiryDate).getTime() < Date.now()) return 'expired'
  return 'active'
}

export function transformSubscription(raw: RawAdyenRecurringContract): Subscription {
  return {
    id: String(raw.recurringDetailReference ?? ''),
    externalId: String(raw.recurringDetailReference ?? ''),
    customerId: raw.shopperReference ?? '',
    status: mapStatus(raw),
    currency: pickCurrency(raw.amount?.currency),
    items: [],
    cancelAt: raw.expiryDate,
    gateway: 'adyen',
    metadata: strMap({ contractType: raw.contractType, variant: raw.variant }),
    createdAt: raw.creationDate,
    raw,
  }
}
