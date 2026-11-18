/**
 * NOWPayments payment → canonical Charge.
 *
 * Fields are the ones in the "Get payment status" (GET /v1/payment/:payment_id)
 * and "Get list of payments" (GET /v1/payment/) examples of the official
 * collection, https://documenter.getpostman.com/view/7907941/2s93JusNJt:
 * payment_id, invoice_id, payment_status, price_amount, price_currency,
 * pay_amount, actually_paid, pay_currency, order_id, order_description,
 * purchase_id, outcome_amount, outcome_currency, created_at, updated_at.
 *
 * `price_amount` / `price_currency` are the price the merchant set, so they
 * are the charge's amount. The crypto side (pay_*, outcome_*) is kept in
 * metadata only: crypto tickers are not ISO 4217.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { requireAmount, requireCurrency, requireId, strMap } from './shared'

export interface RawNowpaymentsPayment {
  payment_id?: number | string | null
  invoice_id?: number | string | null
  payment_status?: string | null
  price_amount?: number | string | null
  price_currency?: string | null
  pay_amount?: number | string | null
  actually_paid?: number | string | null
  pay_currency?: string | null
  order_id?: string | null
  order_description?: string | null
  purchase_id?: number | string | null
  outcome_amount?: number | string | null
  outcome_currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * The documented payment statuses: "waiting", "confirming", "confirmed",
 * "sending", "partially_paid", "finished", "failed", "refunded", "expired"
 * ("the user didn't send the funds to the specified address in the 7 days
 * time window").
 */
function mapStatus(s: string | null | undefined): ChargeStatus {
  switch (s) {
    case 'waiting':
    case 'confirming':
    case 'confirmed':
    case 'sending':
    case 'partially_paid':
      return 'pending'
    case 'finished':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    case 'expired':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export function transformCharge(raw: RawNowpaymentsPayment): Charge {
  const id = requireId(raw.payment_id, 'payment')
  const currency = requireCurrency(raw.price_currency, `payment ${id} price_currency`)
  return {
    id,
    externalId: id,
    amount: majorToMinor(requireAmount(raw.price_amount, `payment ${id} price_amount`), currency),
    currency,
    status: mapStatus(raw.payment_status),
    invoiceId: raw.invoice_id != null ? String(raw.invoice_id) : undefined,
    description: raw.order_description ?? undefined,
    gateway: 'nowpayments',
    metadata: strMap({
      payment_status: raw.payment_status,
      order_id: raw.order_id,
      purchase_id: raw.purchase_id,
      pay_amount: raw.pay_amount,
      actually_paid: raw.actually_paid,
      pay_currency: raw.pay_currency,
      outcome_amount: raw.outcome_amount,
      outcome_currency: raw.outcome_currency,
    }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
