/**
 * Midtrans is transaction-centric: a Core API **transaction** (fetched via
 * `GET /v2/{order_id}/status`) carries the amount, currency, payment status
 * and fraud outcome — so it maps onto the canonical **Charge**. There is no
 * separate customer or charge object; the merchant `order_id` is the stable
 * external id and the Midtrans `transaction_id` is the gateway's own id.
 *
 * Money: `gross_amount` is a decimal string in major IDR units (e.g.
 * `"12000.00"`) → scaled to integer minor units. Timestamps such as
 * `transaction_time` / `settlement_time` are `"YYYY-MM-DD HH:MM:SS"` strings
 * (GMT+7); `toIsoDatetime` normalises the space separator to strict ISO-8601.
 *
 * Refs:
 *   https://docs.midtrans.com/reference/get-transaction-status
 *   https://docs.midtrans.com/reference/transaction-status
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { midtransWib, pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawMidtransTransaction {
  status_code?: string
  status_message?: string
  transaction_id?: string
  order_id?: string
  payment_type?: string
  transaction_time?: string
  settlement_time?: string
  transaction_status?: string
  fraud_status?: string
  gross_amount?: string
  currency?: string
  refund_amount?: string
  masked_card?: string
  bank?: string
  card_type?: string
  channel_response_message?: string
  reference_id?: string
  expiry_time?: string
  [k: string]: unknown
}

/**
 * Map Midtrans `transaction_status` (+ `fraud_status`) onto the canonical
 * charge status. `capture` and `settlement` are successful; `authorize` is a
 * pre-auth awaiting capture (pending); a `challenge`/`deny` fraud verdict
 * overrides an otherwise-captured transaction.
 *
 * Midtrans `transaction_status` values: `authorize`, `capture`, `settlement`,
 * `pending`, `deny`, `cancel`, `expire`, `failure`, `refund`,
 * `partial_refund`.
 */
function mapStatus(raw: RawMidtransTransaction): ChargeStatus {
  const fraud = (raw.fraud_status ?? '').toLowerCase()
  if (fraud === 'deny') return 'failed'
  switch ((raw.transaction_status ?? '').toLowerCase()) {
    case 'capture':
      // A `capture` under fraud `challenge` is held for review → pending.
      return fraud === 'challenge' ? 'pending' : 'succeeded'
    case 'settlement':
      return 'succeeded'
    case 'authorize':
    case 'pending':
      return 'pending'
    case 'deny':
    case 'failure':
      return 'failed'
    case 'expire':
      return 'failed'
    case 'cancel':
      return 'cancelled'
    case 'refund':
      return 'refunded'
    case 'partial_refund':
      return 'partially_refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawMidtransTransaction): Charge {
  const status = (raw.transaction_status ?? '').toLowerCase()
  const captured = status === 'capture' || status === 'settlement'
  return {
    id: String(raw.order_id ?? raw.transaction_id ?? ''),
    externalId: String(raw.order_id ?? raw.transaction_id ?? ''),
    amount: toMinorUnits(raw.gross_amount),
    currency: pickCurrency(raw.currency),
    amountRefunded: raw.refund_amount != null ? toMinorUnits(raw.refund_amount) : undefined,
    status: mapStatus(raw),
    captured: captured || undefined,
    capturedAt: captured ? toIsoDatetime(midtransWib(raw.settlement_time)) : undefined,
    paymentMethodId: raw.transaction_id ? String(raw.transaction_id) : undefined,
    failureMessage:
      status === 'deny' || status === 'failure'
        ? raw.channel_response_message ?? raw.status_message
        : undefined,
    failureCode: status === 'deny' || status === 'failure' ? raw.status_code : undefined,
    gateway: 'midtrans',
    metadata: strMap({
      payment_type: raw.payment_type,
      fraud_status: raw.fraud_status,
      bank: raw.bank,
      card_type: raw.card_type,
      masked_card: raw.masked_card,
      reference_id: raw.reference_id,
    }),
    createdAt: toIsoDatetime(midtransWib(raw.transaction_time)),
    updatedAt: toIsoDatetime(midtransWib(raw.settlement_time ?? raw.transaction_time)),
    raw,
  }
}
