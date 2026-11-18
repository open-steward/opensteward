/**
 * Finix `Subscription` ↔ canonical `Subscription`.
 *
 * A Finix Subscription represents a recurring charge to a Payment Instrument
 * at regular intervals. State is ACTIVE / CANCELED / EXPIRED / NOT_STARTED /
 * PAST_DUE. The buyer's identity is in `buyer_details.identity_id` and the
 * payment instrument in `buyer_details.instrument_id`.
 *
 * Endpoints:
 *   GET /subscriptions                   — list
 *   GET /subscriptions/{subscription_id} — fetch one
 *
 * Docs: https://docs.finix.com/api/subscriptions
 */
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { iso, pickCurrency, strMap } from './shared'

export interface RawFinixSubscriptionDetails {
  collection_method?: string | null
  send_invoice?: boolean | null
  send_receipt?: boolean | null
  trial_details?: {
    interval_type?: string | null
    interval_count?: number | null
    trial_started_at?: string | null
    trial_expected_start_at?: string | null
    trial_expected_end_at?: string | null
  } | null
  discount_phase_details?: {
    amount?: number | null
    billing_interval_count?: number | null
    discount_phase_started_at?: string | null
    discount_phase_expected_start_at?: string | null
    discount_phase_expected_end_at?: string | null
  } | null
}

export interface RawFinixSubscription {
  id?: string
  application_id?: string | null
  amount?: number | null
  billing_interval?: string | null
  buyer_details?: {
    identity_id?: string | null
    instrument_id?: string | null
  } | null
  canceled_via?: string | null
  currency?: string | null
  expires_at?: string | null
  first_charge_at?: string | null
  linked_to?: string | null
  linked_type?: string | null
  next_billing_date?: { year?: number; month?: number; day?: number } | null
  nickname?: string | null
  start_subscription_at?: string | null
  state?: string | null
  subscription_details?: RawFinixSubscriptionDetails | null
  subscription_link_id?: string | null
  subscription_phase?: string | null
  subscription_plan_id?: string | null
  total_billing_intervals?: number | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFinixSubscription): SubscriptionStatus {
  switch ((raw.state ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CANCELED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'PAST_DUE':
      return 'past_due'
    case 'NOT_STARTED':
      return 'incomplete'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawFinixSubscription): Subscription {
  const details = raw.subscription_details ?? {}
  const trial = details.trial_details

  const collectionMethod =
    (details.collection_method ?? '').toUpperCase() === 'BILL_AUTOMATICALLY'
      ? 'charge_automatically'
      : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.buyer_details?.identity_id ?? '',
    status: mapStatus(raw),
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: raw.amount != null
      ? [
          {
            id: String(raw.id ?? ''),
            amount: raw.amount,
          },
        ]
      : [],
    currentPeriodStart: iso(raw.first_charge_at),
    currentPeriodEnd: iso(raw.expires_at),
    trialStart: iso(trial?.trial_started_at ?? trial?.trial_expected_start_at),
    trialEnd: iso(trial?.trial_expected_end_at),
    cancelledAt: raw.canceled_via != null ? iso(raw.updated_at) : undefined,
    defaultPaymentMethodId: raw.buyer_details?.instrument_id ?? undefined,
    collectionMethod,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      billing_interval: raw.billing_interval,
      subscription_plan_id: raw.subscription_plan_id,
      subscription_phase: raw.subscription_phase,
      subscription_link_id: raw.subscription_link_id,
      linked_to: raw.linked_to,
      linked_type: raw.linked_type,
      nickname: raw.nickname,
      canceled_via: raw.canceled_via,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
