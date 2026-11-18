/**
 * 2Checkout Subscription ↔ canonical Subscription.
 *
 * 2Checkout keys a subscription by `SubscriptionReference`. Customer identity
 * is nested under `EndUser.Person`, and the subscribed product under
 * `Product`. 2Checkout does not denominate the subscription itself in minor
 * units on this object, so the canonical `items[].amount` is left unset.
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap } from './shared'

export interface RawVerifone2checkoutSubscription {
  SubscriptionReference?: string
  Status?: string
  StartDate?: string
  ExpirationDate?: string
  NextBillingDate?: string
  RecurringEnabled?: boolean
  Currency?: string
  Product?: { ProductId?: string | number; ProductName?: string } | null
  EndUser?: {
    Person?: {
      Email?: string | null
      FirstName?: string | null
      LastName?: string | null
    } | null
  } | null
  [k: string]: unknown
}

/** Map a 2Checkout subscription status onto the canonical SubscriptionStatus. */
function mapStatus(raw: RawVerifone2checkoutSubscription): SubscriptionStatus {
  switch ((raw.Status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'TRIAL':
      return 'trialing'
    case 'PASTDUE':
    case 'PAST_DUE':
      return 'past_due'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
    case 'FINISHED':
      return 'expired'
    case 'HOLD':
    case 'SUSPENDED':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawVerifone2checkoutSubscription): Subscription {
  const reference = String(raw.SubscriptionReference ?? '')
  const person = raw.EndUser?.Person ?? undefined
  const product = raw.Product ?? undefined
  return {
    id: reference,
    externalId: reference,
    customerId: pickStr(person?.Email) ?? '',
    status: mapStatus(raw),
    currency: raw.Currency ? pickCurrency(raw.Currency) : undefined,
    items: product?.ProductId
      ? [{ id: String(product.ProductId), productId: String(product.ProductId) }]
      : [],
    currentPeriodStart: toIsoDatetime(raw.StartDate),
    currentPeriodEnd: toIsoDatetime(raw.ExpirationDate),
    cancelAtPeriodEnd: raw.RecurringEnabled === false,
    gateway: 'verifone-2checkout',
    metadata: strMap({
      productName: product?.ProductName,
      nextBillingDate: raw.NextBillingDate,
      recurringEnabled: raw.RecurringEnabled,
      endUserName: [pickStr(person?.FirstName), pickStr(person?.LastName)]
        .filter(Boolean)
        .join(' ') || undefined,
    }),
    createdAt: toIsoDatetime(raw.StartDate),
    raw,
  }
}
