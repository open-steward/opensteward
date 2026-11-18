import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'

/**
 * Shape returned by the PhonePe Autopay Subscription Status API.
 * GET /subscriptions/v2/{merchantSubscriptionId}/status
 *
 * Docs: https://developer.phonepe.com/payment-gateway/autopay/api-integration/api-reference/subscription-status
 */
export interface RawPhonepeSubscription {
  merchantSubscriptionId?: string
  subscriptionId?: string
  state?: string
  productType?: string
  authInstrumentType?: string
  authWorkflowType?: string
  amountType?: string
  maxAmount?: number | string
  currency?: string
  frequency?: string
  expireAt?: number
  pauseStartDate?: number | null
  pauseEndDate?: number | null
  createdAt?: number
  [k: string]: unknown
}

function mapStatus(state: string | undefined): SubscriptionStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELLED':
    case 'CANCEL_IN_PROGRESS':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'PAUSED':
    case 'PAUSE_IN_PROGRESS':
    case 'UNPAUSE_IN_PROGRESS':
      return 'paused'
    case 'ACTIVATION_IN_PROGRESS':
    case 'FAILED':
      return 'incomplete'
    case 'REVOKED':
    case 'REVOKE_IN_PROGRESS':
      return 'cancelled'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawPhonepeSubscription): Subscription {
  return {
    id: String(raw.merchantSubscriptionId ?? raw.subscriptionId ?? ''),
    externalId: String(raw.subscriptionId ?? raw.merchantSubscriptionId ?? ''),
    customerId: '',
    status: mapStatus(raw.state),
    currency: pickCurrency(typeof raw.currency === 'string' ? raw.currency : undefined),
    items: [],
    currentPeriodEnd: toIsoDatetime(raw.expireAt),
    cancelledAt: toIsoDatetime(
      (raw.state ?? '').toUpperCase().includes('CANCEL') ||
      (raw.state ?? '').toUpperCase().includes('REVOK')
        ? raw.expireAt
        : undefined,
    ),
    cancelAtPeriodEnd: false,
    gateway: 'phonepe',
    metadata: strMap({
      merchantSubscriptionId: raw.merchantSubscriptionId,
      subscriptionId: raw.subscriptionId,
      productType: raw.productType,
      authInstrumentType: raw.authInstrumentType,
      authWorkflowType: raw.authWorkflowType,
      amountType: raw.amountType,
      maxAmount: raw.maxAmount !== undefined ? String(raw.maxAmount) : undefined,
      frequency: raw.frequency,
      pauseStartDate: raw.pauseStartDate != null ? String(raw.pauseStartDate) : undefined,
      pauseEndDate: raw.pauseEndDate != null ? String(raw.pauseEndDate) : undefined,
    }),
    createdAt: toIsoDatetime(raw.createdAt),
    raw,
  }
}
