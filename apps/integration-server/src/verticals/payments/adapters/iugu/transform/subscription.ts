/**
 * Iugu Subscription -> canonical Subscription.
 *
 * Iugu subscriptions are recurring billing agreements attached to a customer
 * and a plan. Reference: https://dev.iugu.com
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { strMap, safeInt, pickCurrency } from './shared'

export interface RawIuguSubscription {
  [k: string]: unknown
}

function mapStatus(raw: RawIuguSubscription): SubscriptionStatus {
  const s = typeof raw['status'] === 'string' ? raw['status'].toLowerCase() : ''
  if (s === 'active') return 'active'
  if (s === 'suspended' || s === 'past_due') return 'past_due'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  if (s === 'expired') return 'expired'
  if (s === 'trial' || s === 'trialing') return 'trialing'
  return 'active'
}

export function transformSubscription(raw: RawIuguSubscription): Subscription {
  const planId = raw['plan_identifier'] != null ? String(raw['plan_identifier']) : undefined
  const currency = pickCurrency(raw['currency'] as string | undefined, 'BRL')
  const priceAmountCents = safeInt(raw['price_cents'])

  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    customerId: raw['customer_id'] != null ? String(raw['customer_id']) : '',
    status: mapStatus(raw),
    currency,
    items: planId
      ? [
          {
            id: `${String(raw['id'] ?? '')}_item`,
            priceId: planId,
            quantity: 1,
            amount: priceAmountCents || undefined,
          },
        ]
      : [],
    currentPeriodStart:
      raw['current_period_start'] != null ? String(raw['current_period_start']) : undefined,
    currentPeriodEnd:
      raw['current_period_end'] != null ? String(raw['current_period_end']) : undefined,
    cancelledAt: raw['canceled_at'] != null ? String(raw['canceled_at']) : undefined,
    latestInvoiceId:
      raw['recent_invoices'] != null &&
      Array.isArray(raw['recent_invoices']) &&
      (raw['recent_invoices'] as Array<Record<string, unknown>>).length > 0
        ? String((raw['recent_invoices'] as Array<Record<string, unknown>>)[0]?.['id'] ?? '')
        : undefined,
    gateway: 'iugu',
    metadata: strMap(raw['metadata'] ?? raw['custom_variables'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
