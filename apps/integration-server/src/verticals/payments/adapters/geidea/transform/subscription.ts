/**
 * Geidea Subscriptions API — `/subscriptions/api/v1/direct/subscription`
 *
 * Geidea exposes subscription management under a separate host path.  A
 * subscription is created by specifying a customer, a recurring amount, a
 * currency, and a cycle interval/frequency.  The API returns a
 * `subscriptionId`, a `status`, and an `occurrences` array of scheduled
 * payment instances.
 *
 * There is no paginated list-all endpoint documented in the Geidea Direct API;
 * only GET-by-id and Cancel are publicly documented, so `listSubscriptions`
 * is not wired (the interface method is optional).
 *
 * Docs: https://docs.geidea.net/docs/subscriptions
 *       https://docs.geidea.net/docs/get-subscription-1
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, toMinorUnits, strMap } from './shared'

export interface RawGeideaSubscription {
  subscriptionId?: string
  status?: string
  customerId?: string
  recurringPaymentAmount?: number
  currency?: string
  cycleInterval?: string
  cycleFrequency?: number
  startDate?: string
  endDate?: string
  nextOccurrenceDate?: string
  agreementId?: string
  description?: string
  typeOfPayment?: string
  amountVariability?: string
  occurrences?: Array<{
    occurrenceId?: string
    status?: string
    dueDate?: string
    amount?: number
    [k: string]: unknown
  }>
  createdDate?: string
  updatedDate?: string
  [k: string]: unknown
}

function mapSubscriptionStatus(raw: string | null | undefined): SubscriptionStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'active':
    case 'created':
      return 'active'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'expired':
    case 'ended':
      return 'expired'
    case 'paused':
    case 'suspended':
      return 'paused'
    case 'pastdue':
    case 'past_due':
    case 'failed':
      return 'past_due'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawGeideaSubscription): Subscription {
  const currency = pickCurrency(raw.currency)
  const amount = toMinorUnits(raw.recurringPaymentAmount, currency) ?? 0
  return {
    id: String(raw.subscriptionId ?? ''),
    externalId: String(raw.subscriptionId ?? ''),
    customerId: String(raw.customerId ?? ''),
    status: mapSubscriptionStatus(raw.status),
    currency,
    items: [
      {
        id: String(raw.subscriptionId ?? ''),
        amount,
      },
    ],
    currentPeriodStart: toIsoDatetime(raw.startDate),
    currentPeriodEnd: toIsoDatetime(raw.endDate),
    cancelledAt: undefined,
    cancelAt: undefined,
    gateway: 'geidea',
    metadata: strMap({
      cycleInterval: raw.cycleInterval,
      cycleFrequency: raw.cycleFrequency,
      typeOfPayment: raw.typeOfPayment,
      amountVariability: raw.amountVariability,
      agreementId: raw.agreementId,
      description: raw.description,
      nextOccurrenceDate: raw.nextOccurrenceDate,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
