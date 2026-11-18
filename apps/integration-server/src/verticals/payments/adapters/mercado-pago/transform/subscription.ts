/**
 * Mercado Pago "subscriptions" surface as `preapproval` records.
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMPPreapproval {
  id?: string
  payer_id?: string | number
  payer_email?: string
  status?: string
  reason?: string
  preapproval_plan_id?: string
  auto_recurring?: {
    transaction_amount?: number
    currency_id?: string
    frequency?: number
    frequency_type?: string
    start_date?: string
    end_date?: string
  }
  next_payment_date?: string
  date_created?: string
  last_modified?: string
  [k: string]: unknown
}

function mapStatus(raw: RawMPPreapproval): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'authorized':
      return 'active'
    case 'pending':
      return 'incomplete'
    case 'paused':
      return 'paused'
    case 'cancelled':
      return 'cancelled'
    case 'finished':
      return 'expired'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawMPPreapproval): Subscription {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.payer_id ?? raw.payer_email ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(raw.auto_recurring?.currency_id),
    items: raw.preapproval_plan_id
      ? [
          {
            id: raw.preapproval_plan_id,
            priceId: raw.preapproval_plan_id,
            amount: decimalToMinor(raw.auto_recurring?.transaction_amount),
          },
        ]
      : [],
    currentPeriodStart: raw.auto_recurring?.start_date,
    currentPeriodEnd: raw.next_payment_date ?? raw.auto_recurring?.end_date,
    gateway: 'mercado-pago',
    metadata: strMap({ reason: raw.reason }),
    createdAt: raw.date_created,
    updatedAt: raw.last_modified,
    raw,
  }
}
