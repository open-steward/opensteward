/**
 * Cybersource Subscription transform.
 *
 * Cybersource Recurring Billing API exposes subscriptions at:
 *   GET /rbs/v1/subscriptions        — list (query params: offset, limit, filters)
 *   GET /rbs/v1/subscriptions/{id}   — get by ID
 *
 * Subscription statuses: PENDING, ACTIVE, DELINQUENT, SUSPENDED, CANCELLED, COMPLETED
 *
 * Docs: https://developer.cybersource.com/docs/cybs/en-us/recurring-billing
 */

import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawCybersourceSubscription {
  id?: string
  status?: string
  clientReferenceInformation?: { code?: string }
  planInformation?: {
    code?: string
    name?: string
    billingPeriod?: { unit?: string; length?: string | number }
    billingCycles?: { total?: string | number; current?: string | number }
  }
  subscriptionInformation?: {
    code?: string
    planId?: string
    name?: string
    startDate?: string
    status?: string
  }
  paymentInformation?: {
    customer?: { id?: string }
    paymentInstrument?: { id?: string }
  }
  orderInformation?: {
    amountDetails?: {
      billingAmount?: string | number
      currency?: string
      setupFee?: string | number
    }
  }
  submitTimeUtc?: string
  lastModifiedTime?: string
  [k: string]: unknown
}

function mapStatus(s: string | undefined): SubscriptionStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PENDING':
      return 'incomplete'
    case 'DELINQUENT':
      return 'past_due'
    case 'SUSPENDED':
      return 'paused'
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    case 'COMPLETED':
      return 'expired'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawCybersourceSubscription): Subscription {
  const subInfo = raw.subscriptionInformation
  // status is nested inside subscriptionInformation when reading; root status is the request outcome
  const resolvedStatus = subInfo?.status ?? raw.status
  const amtDetails = raw.orderInformation?.amountDetails
  const amount = decimalToMinor(amtDetails?.billingAmount)
  const currency = pickCurrency(amtDetails?.currency)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.paymentInformation?.customer?.id ?? ''),
    status: mapStatus(resolvedStatus),
    currency: currency || undefined,
    items: amount
      ? [
          {
            id: String(raw.id ?? ''),
            amount,
          },
        ]
      : [],
    defaultPaymentMethodId: raw.paymentInformation?.paymentInstrument?.id ?? undefined,
    gateway: 'cybersource',
    metadata: strMap({
      planId: subInfo?.planId,
      planCode: raw.planInformation?.code,
      planName: raw.planInformation?.name,
      subscriptionCode: subInfo?.code,
      subscriptionName: subInfo?.name,
      clientReferenceCode: raw.clientReferenceInformation?.code,
    }),
    createdAt: raw.submitTimeUtc ?? undefined,
    updatedAt: raw.lastModifiedTime ?? undefined,
    raw,
  }
}
