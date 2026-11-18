import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

export interface RawPayPalSubscription {
  id?: string
  status?: string
  plan_id?: string
  subscriber?: { payer_id?: string; email_address?: string }
  billing_info?: {
    cycle_executions?: Array<{ tenure_type?: string }>
    last_payment?: {
      amount?: { value?: string; currency_code?: string }
      time?: string
    }
    next_billing_time?: string
  }
  start_time?: string
  create_time?: string
  update_time?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPayPalSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'APPROVAL_PENDING':
    case 'APPROVED':
      return 'incomplete'
    case 'SUSPENDED':
      return 'paused'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawPayPalSubscription): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.subscriber?.payer_id ?? raw.subscriber?.email_address ?? '',
    status: mapStatus(raw),
    currency: pickCurrency(raw.billing_info?.last_payment?.amount?.currency_code),
    items: raw.plan_id ? [{ id: raw.plan_id, priceId: raw.plan_id }] : [],
    currentPeriodEnd: raw.billing_info?.next_billing_time,
    gateway: 'paypal',
    metadata: strMap({ plan_id: raw.plan_id }),
    createdAt: raw.create_time ?? raw.start_time,
    updatedAt: raw.update_time,
    raw,
  }
}
