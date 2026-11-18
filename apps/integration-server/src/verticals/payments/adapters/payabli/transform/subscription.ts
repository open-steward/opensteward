import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type {
  Subscription,
  SubscriptionItem,
  SubscriptionStatus,
} from '../../../schema/subscription'

/**
 * A row of GET /Query/subscriptions/{entry}, also the body of GET
 * /Subscription/{subId}. Only the fields read here.
 * https://docs.payabli.com/developers/api-reference/subscription/get-subscription.md
 */
export interface RawPayabliSubscription {
  /** "The subscription's ID." */
  IdSub?: number | null
  /** "The subscription's status. - 0: Paused - 1: Active" */
  SubStatus?: number | null
  /** "The subscription amount, including any fees." */
  TotalAmount?: number | null
  /** "The subscription start date." */
  StartDate?: string | null
  /** "The last time the subscription was processed." */
  LastRun?: string | null
  /** "The next date the subscription will be processed." */
  NextDate?: string | null
  /** "Timestamp of when the subscription was created, in UTC." */
  CreatedAt?: string | null
  /** "The last date and time the subscription was updated." */
  LastUpdated?: string | null
  Customer?: { customerId?: number | null } | null
  PaymentData?: { paymentDetails?: { currency?: string | null } | null } | null
  [k: string]: unknown
}

function mapStatus(s: number | null | undefined): SubscriptionStatus {
  if (s === 0) return 'paused'
  if (s === 1) return 'active'
  return 'unknown'
}

export function transformSubscription(raw: RawPayabliSubscription): Subscription {
  if (raw.IdSub == null) throw new Error('Payabli subscription has no IdSub')
  const id = String(raw.IdSub)
  const customerId = raw.Customer?.customerId
  if (customerId == null) throw new Error(`Payabli subscription ${id} has no Customer.customerId`)
  const currency = raw.PaymentData?.paymentDetails?.currency || undefined
  const amount = currency ? majorToMinor(raw.TotalAmount, currency) : undefined
  const items: SubscriptionItem[] = amount !== undefined ? [{ id, amount }] : []
  return {
    id,
    externalId: id,
    customerId: String(customerId),
    status: mapStatus(raw.SubStatus),
    currency,
    items,
    currentPeriodStart: toIsoDatetime(raw.LastRun),
    currentPeriodEnd: toIsoDatetime(raw.NextDate),
    billingAnchor: toIsoDatetime(raw.StartDate),
    gateway: 'payabli',
    metadata: {},
    createdAt: toIsoDatetime(raw.CreatedAt),
    updatedAt: toIsoDatetime(raw.LastUpdated),
    raw,
  }
}
