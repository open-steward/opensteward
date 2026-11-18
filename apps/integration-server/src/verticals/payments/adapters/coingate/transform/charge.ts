/**
 * A CoinGate **Order** is the unit that carries the amount, currency and
 * payment status — so it maps onto the canonical **Charge**. The shopper's
 * email (when CoinGate echoes it back) becomes `receiptEmail`; CoinGate has
 * no standalone customer resource, so there is no `customerId`.
 *
 * Money: CoinGate returns `price_amount` / `receive_amount` as **decimal
 * strings in major units** (e.g. `"10.0"`). We convert to integer minor
 * units for the canonical schema (see toMinorUnits) and keep the original
 * strings on `metadata` for lossless reconciliation. `price_*` is the amount
 * the merchant priced the order in; `receive_*` is the (possibly crypto)
 * settlement — we canonicalise on the *price* side, since that is the
 * shopper-facing charge.
 *
 * Timestamps are ISO-8601 with an offset (`2022-12-09T14:02:41+00:00`); we
 * still normalise through toIsoDatetime to guarantee a strict-ISO output.
 *
 * Refs:
 *   https://developer.coingate.com/reference/get-order
 *   https://developer.coingate.com/reference/list-orders
 *   https://developer.coingate.com/reference/order-statuses
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawCoingateOrder {
  id?: number | string
  order_id?: string
  status?: string
  title?: string
  description?: string
  do_not_convert?: boolean
  price_currency?: string
  price_amount?: string
  receive_currency?: string
  receive_amount?: string
  pay_currency?: string
  pay_amount?: string
  underpaid_amount?: string
  overpaid_amount?: string
  is_refundable?: boolean
  lightning_network?: boolean
  payment_url?: string
  token?: string
  refunds?: unknown[]
  voids?: unknown[]
  fees?: unknown[]
  blockchain_transactions?: unknown[]
  created_at?: string
  paid_at?: string
  expired_at?: string
  // Some payloads echo the shopper back; fields are best-effort.
  shopper?: { email?: string } & Record<string, unknown>
  [k: string]: unknown
}

/**
 * CoinGate order statuses: new, pending, confirming, paid, invalid, expired,
 * canceled, refunded, partially_refunded.
 */
function mapStatus(raw: RawCoingateOrder): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
      return 'succeeded'
    case 'refunded':
      return 'refunded'
    case 'partially_refunded':
      return 'partially_refunded'
    case 'invalid':
      return 'failed'
    case 'expired':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'new':
    case 'pending':
    case 'confirming':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCoingateOrder): Charge {
  const status = (raw.status ?? '').toLowerCase()
  const email = typeof raw.shopper?.email === 'string' ? raw.shopper.email : undefined
  return {
    id: String(raw.id ?? raw.order_id ?? ''),
    externalId: String(raw.id ?? raw.order_id ?? ''),
    amount: toMinorUnits(raw.price_amount),
    currency: pickCurrency(raw.price_currency),
    status: mapStatus(raw),
    captured: status === 'paid' ? true : undefined,
    capturedAt: status === 'paid' ? toIsoDatetime(raw.paid_at) : undefined,
    receiptEmail: email,
    receiptUrl: raw.payment_url,
    description: raw.description ?? raw.title ?? undefined,
    gateway: 'coingate',
    metadata: strMap({
      merchant_order_id: raw.order_id,
      price_amount: raw.price_amount,
      receive_currency: raw.receive_currency,
      receive_amount: raw.receive_amount,
      pay_currency: raw.pay_currency,
      pay_amount: raw.pay_amount,
      underpaid_amount: raw.underpaid_amount,
      overpaid_amount: raw.overpaid_amount,
      is_refundable: raw.is_refundable,
      lightning_network: raw.lightning_network,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.paid_at ?? raw.expired_at ?? raw.created_at),
    raw,
  }
}
