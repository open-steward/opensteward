/**
 * Helcim subscription ↔ canonical Subscription.
 *
 * The Helcim Recurring API exposes subscriptions at `GET /subscriptions` and
 * `GET /subscriptions/{id}`. A subscription object carries:
 *   id               — numeric subscription id
 *   customerCode     — linked customer identifier
 *   paymentPlanId    — associated payment plan id
 *   recurringAmount  — decimal dollars charged per cycle
 *   setupAmount      — initial setup charge (decimal dollars)
 *   status           — e.g. "active", "inactive", "cancelled"
 *   dateBilling      — next billing date (YYYY-MM-DD HH:MM:SS)
 *   dateActivated    — when subscription became active
 *   dateCreated      — creation date
 *   dateUpdated      — last update
 *   timesBilled      — count of completed billing cycles
 *   freeTrialPeriod  — trial period length
 *   hasFailedPayments — boolean
 *   payments         — array of payment sub-objects
 *
 * Dates are YYYY-MM-DD HH:MM:SS Mountain Time; `toIsoDatetime` normalises.
 * Helcim does not expose a per-subscription currency field; we default to CAD
 * (Helcim's home currency) since currency is plan-level.
 *
 * Refs:
 *   https://devdocs.helcim.com/docs/recurring-subscriptions
 *   https://devdocs.helcim.com/reference/subscription-create
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { strMap, toMinorUnits } from './shared'

export interface RawHelcimSubscriptionPayment {
  id?: number | string
  amount?: number | string
  status?: string
  dateProcessed?: string
  paymentNumber?: number | string
  numberOfRetries?: number | string
  [k: string]: unknown
}

export interface RawHelcimSubscription {
  id?: number | string
  customerCode?: string
  paymentPlanId?: number | string
  recurringAmount?: number | string
  setupAmount?: number | string
  status?: string
  dateBilling?: string
  dateActivated?: string
  dateCreated?: string
  dateUpdated?: string
  timesBilled?: number | string
  freeTrialPeriod?: number | string
  hasFailedPayments?: boolean | number | string
  isProrated?: boolean | number | string
  payments?: RawHelcimSubscriptionPayment[]
  subscriptionAddOns?: unknown[]
  [k: string]: unknown
}

function mapStatus(raw: RawHelcimSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'inactive':
    case 'paused':
      return 'paused'
    case 'cancelled':
    case 'deleted':
      return 'cancelled'
    case 'expired':
      return 'expired'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawHelcimSubscription): Subscription {
  const amount = toMinorUnits(raw.recurringAmount)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customerCode ?? ''),
    status: mapStatus(raw),
    // Helcim subscriptions don't carry a standalone currency; CAD is the
    // platform default. The actual currency lives on the payment plan.
    currency: undefined,
    items: amount > 0
      ? [
          {
            id: String(raw.id ?? ''),
            productId: raw.paymentPlanId != null ? String(raw.paymentPlanId) : undefined,
            quantity: 1,
            amount,
          },
        ]
      : [],
    currentPeriodEnd: raw.dateBilling ? toIsoDatetime(raw.dateBilling) : undefined,
    billingAnchor: raw.dateActivated ? toIsoDatetime(raw.dateActivated) : undefined,
    gateway: 'helcim',
    metadata: strMap({
      paymentPlanId: raw.paymentPlanId,
      timesBilled: raw.timesBilled,
      freeTrialPeriod: raw.freeTrialPeriod,
      hasFailedPayments: raw.hasFailedPayments,
      isProrated: raw.isProrated,
    }),
    createdAt: raw.dateCreated ? toIsoDatetime(raw.dateCreated) : undefined,
    updatedAt: raw.dateUpdated ? toIsoDatetime(raw.dateUpdated) : undefined,
    raw,
  }
}
