/**
 * Maps a Nexi Checkout (Nets Easy) **subscription** onto the canonical
 * `Subscription`.
 *
 * The Payment API v1 exposes `GET /v1/subscriptions/{subscriptionId}` which
 * returns a slim subscription record:
 *   - subscriptionId  — UUID
 *   - frequency       — integer (not used by canonical schema)
 *   - interval        — minimum days between charges
 *   - endDate         — subscription expiry (ISO-8601 date string)
 *   - paymentDetails  — paymentType / paymentMethod / cardDetails
 *
 * Nexi subscriptions are created via a payment (POST /v1/payments) that
 * includes a `subscription` block; the subscription ID is then attached to
 * that payment object. There is no separate customer resource, so we leave
 * `customerId` empty. Status is always `active` because the API has no
 * lifecycle status field — a subscription either exists or it doesn't.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/api/payment-v1/
 */
import type { Subscription } from '../../../schema/subscription'
import { toIsoDatetime, strMap } from './shared'

export interface RawNexiSubscriptionPaymentDetails {
  paymentType?: string
  paymentMethod?: string
  cardDetails?: {
    maskedPan?: string
    expiryDate?: string
  }
}

export interface RawNexiSubscription {
  subscriptionId?: string
  /** Minimum number of days between each recurring charge. */
  interval?: number
  /** Maximum charges per interval period. */
  frequency?: number
  /** ISO-8601 date after which no further charges may be made. */
  endDate?: string
  paymentDetails?: RawNexiSubscriptionPaymentDetails
  [k: string]: unknown
}

export function transformSubscription(raw: RawNexiSubscription): Subscription {
  const id = raw.subscriptionId ?? ''

  const meta: Record<string, unknown> = {
    frequency: raw.frequency,
    interval: raw.interval,
    paymentType: raw.paymentDetails?.paymentType,
    paymentMethod: raw.paymentDetails?.paymentMethod,
    maskedPan: raw.paymentDetails?.cardDetails?.maskedPan,
    expiryDate: raw.paymentDetails?.cardDetails?.expiryDate,
  }

  return {
    id: String(id),
    externalId: String(id),
    // Nexi has no standalone customer resource; customerId is unavailable.
    customerId: '',
    // Subscriptions returned by the API are always active (no status field).
    status: 'active',
    // Nexi subscriptions have no currency on the subscription object itself.
    currency: undefined,
    items: [],
    currentPeriodStart: undefined,
    currentPeriodEnd: toIsoDatetime(raw.endDate),
    cancelledAt: undefined,
    gateway: 'nexi',
    metadata: strMap(meta),
    createdAt: undefined,
    updatedAt: undefined,
    raw,
  }
}
