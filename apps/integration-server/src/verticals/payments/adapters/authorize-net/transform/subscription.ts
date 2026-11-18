import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { decimalToMinor, strMap } from './shared'

// Returned by ARBGetSubscriptionRequest (get single subscription).
// Maps to ARBSubscriptionMaskedType from the Authorize.net JSON API.
export interface RawAuthNetSubscriptionMasked {
  name?: string
  paymentSchedule?: {
    interval?: { length?: number | string; unit?: string }
    startDate?: string
    totalOccurrences?: number | string
    trialOccurrences?: number | string
  }
  amount?: string | number
  trialAmount?: string | number
  status?: string
  profile?: {
    customerProfileId?: string
    paymentProfile?: {
      customerPaymentProfileId?: string
    }
  }
  [k: string]: unknown
}

// Returned by ARBGetSubscriptionListRequest (list of subscriptions).
// Maps to SubscriptionDetailType from the Authorize.net JSON API.
export interface RawAuthNetSubscriptionDetail {
  id?: string | number
  name?: string
  status?: string
  createTimeStampUTC?: string
  firstName?: string
  lastName?: string
  totalOccurrences?: number | string
  pastOccurrences?: number | string
  accountNumber?: string
  amount?: string | number
  currencyCode?: string
  customerProfileId?: string | number
  customerPaymentProfileId?: string | number
  [k: string]: unknown
}

function mapSubscriptionStatus(raw: string | undefined): SubscriptionStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'expired':
      return 'expired'
    case 'suspended':
      return 'past_due'
    case 'canceled':
    case 'cancelled':
    case 'terminated':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscriptionMasked(
  subscriptionId: string,
  raw: RawAuthNetSubscriptionMasked,
): Subscription {
  const customerId = String(raw.profile?.customerProfileId ?? '')
  const schedule = raw.paymentSchedule
  const interval = schedule?.interval

  return {
    id: subscriptionId,
    externalId: subscriptionId,
    customerId,
    status: mapSubscriptionStatus(raw.status),
    currency: 'USD',
    items: [
      {
        id: subscriptionId,
        amount: decimalToMinor(raw.amount),
      },
    ],
    currentPeriodStart: schedule?.startDate
      ? new Date(schedule.startDate).toISOString()
      : undefined,
    defaultPaymentMethodId: raw.profile?.paymentProfile?.customerPaymentProfileId
      ? `${customerId}:${raw.profile.paymentProfile.customerPaymentProfileId}`
      : undefined,
    gateway: 'authorize-net',
    metadata: strMap({
      name: raw.name,
      interval_unit: interval?.unit,
      interval_length: interval?.length,
      total_occurrences: schedule?.totalOccurrences,
      trial_occurrences: schedule?.trialOccurrences,
    }),
    raw,
  }
}

export function transformSubscriptionDetail(raw: RawAuthNetSubscriptionDetail): Subscription {
  const id = String(raw.id ?? '')
  const customerId = String(raw.customerProfileId ?? '')

  return {
    id,
    externalId: id,
    customerId,
    status: mapSubscriptionStatus(raw.status),
    currency: (raw.currencyCode as string | undefined) ?? 'USD',
    items: [
      {
        id,
        amount: decimalToMinor(raw.amount),
      },
    ],
    createdAt: raw.createTimeStampUTC,
    gateway: 'authorize-net',
    metadata: strMap({
      name: raw.name,
      first_name: raw.firstName,
      last_name: raw.lastName,
      total_occurrences: raw.totalOccurrences,
      past_occurrences: raw.pastOccurrences,
      account_number: raw.accountNumber,
    }),
    raw,
  }
}
