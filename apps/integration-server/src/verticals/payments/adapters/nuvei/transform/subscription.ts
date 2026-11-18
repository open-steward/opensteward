/**
 * Nuvei getSubscriptionsList response → canonical Subscription.
 *
 * Nuvei rebilling subscriptions are retrieved via `getSubscriptionsList.do`.
 * Each subscription record includes a `subscriptionId`, a `planId`, a
 * `userTokenId` (customer), `currency`, `recurringAmount`, `status`,
 * `startDate` / `endDate`, and `initialTransactionId`. The `status` field
 * uses Nuvei's rebilling states: ACTIVE, CANCELLED, EXPIRED, SUSPENDED.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawNuveiSubscription {
  subscriptionId?: string
  merchantId?: string
  merchantSiteId?: string
  userTokenId?: string
  currency?: string
  recurringAmount?: string | number
  initialAmount?: string | number
  status?: string             // "ACTIVE" | "CANCELLED" | "EXPIRED" | "SUSPENDED"
  planId?: string
  startDate?: string          // "YYYY-MM-DD" or timestamp
  endDate?: string
  recurringPeriod?: {
    day?: string | number
    [k: string]: unknown
  }
  initialTransactionId?: string
  userPaymentOptionId?: string
  [k: string]: unknown
}

export interface RawNuveiGetSubscriptionsListResponse {
  subscriptions?: RawNuveiSubscription[]
  /** Single subscription returned when querying by id */
  subscription?: RawNuveiSubscription
  status?: string
  errCode?: number
  reason?: string
  [k: string]: unknown
}

function mapStatus(raw: RawNuveiSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'SUSPENDED':
      return 'paused'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawNuveiSubscription): Subscription {
  const id = raw.subscriptionId ?? ''
  const amount = toMinorUnits(raw.recurringAmount)

  return {
    id: String(id),
    externalId: String(id),
    customerId: String(raw.userTokenId ?? ''),
    status: mapStatus(raw),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: amount !== undefined
      ? [{ id: String(id), amount, metadata: {} }]
      : [],
    currentPeriodStart: toIsoDatetime(raw.startDate),
    currentPeriodEnd: toIsoDatetime(raw.endDate),
    billingAnchor: toIsoDatetime(raw.startDate),
    trialStart: undefined,
    trialEnd: undefined,
    cancelAt: undefined,
    cancelledAt: mapStatus(raw) === 'cancelled' ? toIsoDatetime(raw.endDate) : undefined,
    cancelAtPeriodEnd: undefined,
    collectionMethod: 'charge_automatically',
    dunningState: undefined,
    defaultPaymentMethodId: pickStr(raw.userPaymentOptionId),
    latestInvoiceId: undefined,
    gateway: 'nuvei',
    metadata: strMap({
      planId: raw.planId,
      initialTransactionId: raw.initialTransactionId,
      initialAmount: pickStr(raw.initialAmount),
    }),
    createdAt: toIsoDatetime(raw.startDate),
    updatedAt: undefined,
    raw,
  }
}
