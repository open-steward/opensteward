import type { Subscription, SubscriptionStatus, SubscriptionItem } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, pickNum, strMap } from './shared'

/**
 * A Paysafe **Subscription** (subscriptionsplans/v1/subscriptions) maps onto
 * the canonical **Subscription**. Subscriptions reference a plan and track
 * billing cycles, status, and schedule.
 *
 * Docs: https://developer.paysafe.com/en/api-docs/payment-scheduler/using-the-api/api-endpoints/
 */
export interface RawPaysafeSubscriptionPlan {
  id?: string
  name?: string
  amount?: number
  currencyCode?: string
  billingCycle?: { frequency?: string; interval?: number; numberOfCycles?: number }
  [k: string]: unknown
}

export interface RawPaysafeSubscriptionProfile {
  id?: string
  merchantCustomerId?: string
  email?: string
  [k: string]: unknown
}

export interface RawPaysafeSubscriptionSchedule {
  previousPayment?: { amount?: number; status?: string; txnTime?: string }
  nextPayment?: { amount?: number; scheduleDate?: string }
  retryPayment?: unknown
  [k: string]: unknown
}

export interface RawPaysafeSubscription {
  id?: string
  merchantRefNum?: string
  accountId?: string
  status?: string
  startDate?: string
  endDate?: string
  billingPeriodStartDate?: string
  billingPeriodEndDate?: string
  reasonForCancellation?: string
  effectiveCancellationDate?: string
  paymentToken?: string
  paymentType?: string
  creationTime?: string
  lastUpdatedTime?: string
  plan?: RawPaysafeSubscriptionPlan
  profile?: RawPaysafeSubscriptionProfile
  schedule?: RawPaysafeSubscriptionSchedule
  [k: string]: unknown
}

/**
 * Map Paysafe subscription status → canonical SubscriptionStatus.
 * Paysafe statuses: ACTIVE, CANCELLED, EXPIRED, PAST_DUE, SUSPENDED.
 */
function mapStatus(raw: RawPaysafeSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'PAST_DUE':
      return 'past_due'
    case 'SUSPENDED':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawPaysafeSubscription): Subscription {
  const plan = raw.plan

  const items: SubscriptionItem[] = plan
    ? [
        {
          id: String(plan.id ?? raw.id ?? ''),
          amount: pickNum(plan.amount),
          metadata: {},
        },
      ]
    : []

  return {
    id: String(raw.id ?? raw.merchantRefNum ?? ''),
    externalId: String(raw.id ?? raw.merchantRefNum ?? ''),
    customerId: String(raw.profile?.id ?? raw.profile?.merchantCustomerId ?? ''),
    status: mapStatus(raw),
    currency: pickCurrency(plan?.currencyCode) ?? undefined,
    items,
    currentPeriodStart: toIsoDatetime(raw.billingPeriodStartDate),
    currentPeriodEnd: toIsoDatetime(raw.billingPeriodEndDate),
    cancelledAt: toIsoDatetime(raw.effectiveCancellationDate),
    defaultPaymentMethodId: pickStr(raw.paymentToken),
    gateway: 'paysafe',
    metadata: strMap({
      merchantRefNum: raw.merchantRefNum,
      accountId: raw.accountId,
      planId: plan?.id,
      planName: plan?.name,
      paymentType: raw.paymentType,
      reasonForCancellation: raw.reasonForCancellation,
      startDate: raw.startDate,
      endDate: raw.endDate,
    }),
    createdAt: toIsoDatetime(raw.creationTime),
    updatedAt: toIsoDatetime(raw.lastUpdatedTime ?? raw.creationTime),
    raw,
  }
}
