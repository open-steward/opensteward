import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawRecurlySubscription {
  id?: string
  uuid?: string
  state?: string
  account?: { id?: string; code?: string }
  plan?: { id?: string; code?: string }
  currency?: string
  unit_amount?: number
  quantity?: number
  current_period_started_at?: string
  current_period_ends_at?: string
  trial_started_at?: string
  trial_ends_at?: string
  canceled_at?: string
  expires_at?: string
  remaining_billing_cycles?: number
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawRecurlySubscription): SubscriptionStatus {
  switch ((raw.state ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'paused':
      return 'paused'
    case 'canceled':
      return 'cancelled'
    case 'expired':
      return 'expired'
    case 'failed':
      return 'past_due'
    case 'future':
      return 'incomplete'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawRecurlySubscription): Subscription {
  return {
    id: String(raw.id ?? raw.uuid ?? ''),
    externalId: String(raw.uuid ?? raw.id ?? ''),
    customerId: String(raw.account?.id ?? raw.account?.code ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    items: raw.plan?.id
      ? [
          {
            id: raw.plan.id,
            priceId: raw.plan.code,
            quantity: raw.quantity,
            amount: decimalToMinor(raw.unit_amount),
          },
        ]
      : [],
    currentPeriodStart: raw.current_period_started_at,
    currentPeriodEnd: raw.current_period_ends_at,
    trialStart: raw.trial_started_at,
    trialEnd: raw.trial_ends_at,
    cancelledAt: raw.canceled_at,
    cancelAt: raw.expires_at,
    gateway: 'recurly',
    metadata: strMap({ remaining_billing_cycles: raw.remaining_billing_cycles }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
