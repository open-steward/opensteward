/**
 * Rebilly subscription order → canonical Subscription
 * (components/schemas/Subscription.yaml). `status` enum: pending, active,
 * abandoned, canceled, churned, paused, voided, completed, trial-ended.
 * "A subscription starts in the `pending` status, and becomes `active` when
 * the service period begins." `inTrial`: "Specifies if the subscription is
 * currently in a trial period."
 */
import type {
  Subscription,
  SubscriptionItem,
  SubscriptionStatus,
} from '../../../schema/subscription'
import { currencyOf, requireId, str, strMap } from './shared'

export interface RawRebillySubscriptionItem {
  id?: string
  quantity?: number
  plan?: { id?: string; productId?: string; [k: string]: unknown }
  [k: string]: unknown
}

export interface RawRebillySubscription {
  id?: string
  orderType?: string
  customerId?: string
  status?: string
  inTrial?: boolean
  trial?: { enabled?: boolean; endTime?: string | null } | null
  currency?: string
  items?: RawRebillySubscriptionItem[]
  currentPeriodStart?: string
  currentPeriodEnd?: string
  canceledTime?: string | null
  paymentInstrumentId?: string | null
  recentInvoiceId?: string | null
  customFields?: Record<string, unknown>
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

function mapStatus(status: string | undefined, inTrial: boolean | undefined): SubscriptionStatus {
  switch (status) {
    case 'active':
      return inTrial === true ? 'trialing' : 'active'
    case 'pending':
      return 'incomplete'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'voided':
      return 'cancelled'
    case 'churned':
    case 'completed':
    case 'trial-ended':
      return 'expired'
    default:
      return 'unknown'
  }
}

function mapItem(item: RawRebillySubscriptionItem, subscriptionId: string): SubscriptionItem {
  return {
    id: requireId(item.id, `subscription ${subscriptionId} item id`),
    priceId: str(item.plan?.id),
    productId: str(item.plan?.productId),
    quantity:
      typeof item.quantity === 'number' && Number.isInteger(item.quantity)
        ? item.quantity
        : undefined,
  }
}

export function transformSubscription(raw: RawRebillySubscription): Subscription {
  const id = requireId(raw.id, 'subscription id')
  return {
    id,
    externalId: id,
    customerId: requireId(raw.customerId, `subscription ${id} customerId`),
    status: mapStatus(raw.status, raw.inTrial),
    currency: currencyOf(raw.currency),
    items: Array.isArray(raw.items) ? raw.items.map((item) => mapItem(item, id)) : [],
    currentPeriodStart: str(raw.currentPeriodStart),
    currentPeriodEnd: str(raw.currentPeriodEnd),
    trialEnd: raw.trial?.enabled === true ? str(raw.trial.endTime) : undefined,
    cancelledAt: str(raw.canceledTime),
    defaultPaymentMethodId: str(raw.paymentInstrumentId),
    latestInvoiceId: str(raw.recentInvoiceId),
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
