/**
 * Midtrans Subscription API — `GET /v1/subscriptions/{id}`.
 *
 * Midtrans subscriptions live under the Core API base URL (not the Iris payout
 * host). A subscription carries its own `id`, recurring `amount` (major IDR
 * units as a string), `currency`, `status` ("active" | "inactive"), a
 * `schedule` object with `interval` / `interval_type` / `max_interval`, and
 * an array of `transaction_ids` for charges already billed.
 *
 * There is no list-subscriptions endpoint; subscriptions are fetched by id.
 *
 * Canonical mapping:
 *   • `customerId`  ← `customer_details.id` (the merchant-assigned customer
 *                     reference passed at creation time; may be absent)
 *   • `items[0]`    ← synthetic item from subscription amount/currency
 *   • `currency`    ← always "IDR" from Midtrans currently
 *   • `status`      ← "active" | "inactive" (inactive = cancelled/paused)
 *
 * Refs:
 *   https://docs.midtrans.com/reference/create-subscription
 *   https://docs.midtrans.com/reference/get-subscription
 *   https://docs.midtrans.com/reference/cancel-subscription
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { midtransWib, pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawMidtransSchedule {
  interval?: number
  interval_type?: string
  max_interval?: number
  start_time?: string
  [k: string]: unknown
}

export interface RawMidtransSubscription {
  id?: string
  name?: string
  amount?: string | number
  currency?: string
  created_at?: string
  status?: string
  status_message?: string
  token?: string
  payment_type?: string
  schedule?: RawMidtransSchedule
  transaction_ids?: string[]
  metadata?: Record<string, unknown>
  customer_details?: {
    id?: string
    email?: string
    first_name?: string
    last_name?: string
    phone?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

function mapStatus(raw: RawMidtransSubscription): SubscriptionStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'inactive':
      return 'cancelled'
    default:
      return 'active'
  }
}

export function transformSubscription(raw: RawMidtransSubscription): Subscription {
  const amountMinor = toMinorUnits(raw.amount)
  const currency = pickCurrency(raw.currency)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: String(raw.customer_details?.id ?? raw.id ?? ''),
    status: mapStatus(raw),
    currency,
    items: amountMinor
      ? [
          {
            id: String(raw.id ?? ''),
            amount: amountMinor,
          },
        ]
      : [],
    gateway: 'midtrans',
    metadata: strMap({
      name: raw.name,
      payment_type: raw.payment_type,
      token: raw.token,
      schedule_interval: raw.schedule?.interval,
      schedule_interval_type: raw.schedule?.interval_type,
      max_interval: raw.schedule?.max_interval,
    }),
    createdAt: toIsoDatetime(midtransWib(raw.created_at)),
    raw,
  }
}
