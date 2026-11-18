import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMollieSubscription {
  id?: string
  customerId?: string
  status?: string
  amount?: { value?: string; currency?: string }
  times?: number
  interval?: string
  description?: string
  method?: string
  mandateId?: string
  nextPaymentDate?: string
  startDate?: string
  canceledAt?: string
  createdAt?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawMollieSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'pending':
      return 'incomplete'
    case 'canceled':
      return 'cancelled'
    case 'completed':
      return 'expired'
    case 'suspended':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawMollieSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customerId ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(raw.amount?.currency),
    items: [
      {
        id: String(raw.id ?? ''),
        amount: decimalToMinor(raw.amount?.value),
      },
    ],
    currentPeriodStart: raw.startDate,
    currentPeriodEnd: raw.nextPaymentDate,
    cancelledAt: raw.canceledAt,
    defaultPaymentMethodId: raw.mandateId,
    gateway: 'mollie',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt,
    raw,
  }
}
