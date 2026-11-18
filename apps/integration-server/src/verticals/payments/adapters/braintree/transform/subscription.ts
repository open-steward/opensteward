import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

export interface RawBraintreeSubscription {
  id?: string
  status?: string
  plan?: { id?: string }
  paymentMethod?: { id?: string }
  price?: { value?: string; currencyIsoCode?: string }
  billingPeriodStartDate?: string
  billingPeriodEndDate?: string
  nextBillingDate?: string
  trialEndDate?: string
  createdAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawBraintreeSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PAST_DUE':
      return 'past_due'
    case 'CANCELED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'PENDING':
      return 'incomplete'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawBraintreeSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: '',
    status: mapStatus(raw),
    currency: pickCurrency(raw.price?.currencyIsoCode),
    items: raw.plan?.id ? [{ id: raw.plan.id, priceId: raw.plan.id }] : [],
    currentPeriodStart: raw.billingPeriodStartDate,
    currentPeriodEnd: raw.billingPeriodEndDate,
    trialEnd: raw.trialEndDate,
    defaultPaymentMethodId: raw.paymentMethod?.id,
    gateway: 'braintree',
    metadata: strMap({}),
    createdAt: raw.createdAt,
    raw,
  }
}
