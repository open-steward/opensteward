import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * BlueSnap recurring subscription. Lives under `/services/2/recurring/subscriptions`.
 * Amounts are decimal major units. Dates are ISO 8601 (YYYY-MM-DD).
 *
 * Docs: https://developers.bluesnap.com/v8976-JSON/reference/retrieve-specific-subscription
 */
export interface RawBluesnapSubscription {
  subscriptionId?: string | number
  planId?: string | number
  vaultedShopperId?: string | number
  status?: string
  quantity?: number
  chargeFrequency?: string
  recurringChargeAmount?: number | string
  currency?: string
  autoRenew?: boolean
  trialPeriodDays?: number
  initialChargeAmount?: number | string
  nextChargeDate?: string
  softDescriptor?: string
  payerInfo?: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
  }
  paymentSource?: unknown
  charge?: unknown
  [k: string]: unknown
}

function mapStatus(raw: string | undefined): SubscriptionStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'SUSPENDED':
      return 'past_due'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawBluesnapSubscription): Subscription {
  const id = String(raw.subscriptionId ?? '')
  return {
    id,
    externalId: id,
    customerId: raw.vaultedShopperId != null ? String(raw.vaultedShopperId) : '',
    status: mapStatus(raw.status),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: raw.planId != null
      ? [
          {
            id: `${id}-item`,
            priceId: String(raw.planId),
            amount: toMinorUnits(raw.recurringChargeAmount),
            quantity: raw.quantity ?? 1,
            metadata: {},
          },
        ]
      : [],
    currentPeriodEnd: raw.nextChargeDate ? toIsoDatetime(raw.nextChargeDate) : undefined,
    cancelAtPeriodEnd: raw.autoRenew === false,
    gateway: 'bluesnap',
    metadata: strMap({
      chargeFrequency: raw.chargeFrequency,
      softDescriptor: raw.softDescriptor,
      trialPeriodDays: raw.trialPeriodDays,
    }),
    raw,
  }
}
