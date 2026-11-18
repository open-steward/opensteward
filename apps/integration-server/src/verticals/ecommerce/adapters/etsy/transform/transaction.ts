/**
 * Etsy Payment / PaymentAdjustment → canonical Transaction.
 *
 * Etsy exposes payments per-receipt, not shop-wide:
 * GET /shops/{shop_id}/receipts/{receipt_id}/payments (getShopPaymentByReceiptId)
 * returns the Payment(s) tied to one order. There is no shop-wide payment
 * *list* — `getPayments` (GET /shops/{shop_id}/payments) exists but takes
 * `payment_ids` (a fetch-by-known-ids call, not a browse), so listTransactions
 * requires `orderId` the same way listRefunds does.
 *
 * A Payment is the capture/sale side of an order and maps to a SALE
 * transaction. Each entry in its `payment_adjustments[]` array is a
 * post-capture adjustment (a refund, chargeback, etc. against that payment)
 * and maps to a REFUND transaction pointing back at the sale:
 *  - REFUND `id` = payment_adjustment_id
 *  - REFUND `parentTransactionId` = payment_id (the SALE's id)
 *
 * Key mapping decisions:
 *  - SALE `id` = payment_id (stringified) — a real Etsy id, unlike
 *    refund.ts's synthetic index-based id, so it round-trips through
 *    `getPayments` for getTransaction.
 *  - `amount` uses the gross Money object (amount_gross for a Payment,
 *    total_adjustment_amount for an adjustment) — Etsy's Money shape
 *    (amount + divisor + currency_code), same as product price and refund
 *    amount elsewhere in this adapter.
 *  - Payment `status` ("settled" → SUCCESS, "authed" → PENDING, anything
 *    else → 'unknown').
 *  - Adjustment status comes from the boolean `is_success` field, not the
 *    string `status` field — only is_success's two values are documented
 *    (true → SUCCESS, false → FAILURE, missing → 'unknown').
 *
 *  Both choices were confirmed against Etsy's own OpenAPI document on
 *  2026-09-15 rather than inferred: neither status field carries an enum, and
 *  `is_success` is the only one of the two with documented semantics. See
 *  `mapPaymentStatus` / `mapAdjustmentStatus` below.
 *  - `processedAt`/`createdAt` from `created_timestamp` epoch seconds.
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import type { RawEtsyMoney } from './product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEtsyPaymentAdjustment {
  payment_adjustment_id?: number
  payment_id?: number
  status?: string
  is_success?: boolean
  reason_code?: number | string
  total_adjustment_amount?: RawEtsyMoney
  shop_total_adjustment_amount?: RawEtsyMoney
  buyer_total_adjustment_amount?: RawEtsyMoney
  created_timestamp?: number
  payment_adjustment_items?: unknown[]
  [key: string]: unknown
}

export interface RawEtsyPayment {
  payment_id?: number
  receipt_id?: number
  amount_gross?: RawEtsyMoney
  amount_fees?: RawEtsyMoney
  amount_net?: RawEtsyMoney
  posted_gross?: RawEtsyMoney
  posted_fees?: RawEtsyMoney
  posted_net?: RawEtsyMoney
  adjusted_gross?: RawEtsyMoney
  adjusted_fees?: RawEtsyMoney
  adjusted_net?: RawEtsyMoney
  currency?: string
  status?: string
  created_timestamp?: number
  updated_timestamp?: number
  payment_adjustments?: RawEtsyPaymentAdjustment[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function etsyMoneyToCanonical(
  money: RawEtsyMoney | undefined,
): { amount: number; currency: string } | undefined {
  if (!money || money.divisor === 0) return undefined
  return {
    amount: majorToMinor(money.amount / money.divisor, money.currency_code),
    currency: money.currency_code,
  }
}

function tsToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

/**
 * Etsy publishes NO enum for `Payment.status`.
 *
 * Checked against the vendor's own OpenAPI document
 * (https://www.etsy.com/openapi/generated/oas/3.0.0.json, "Etsy Open API v3
 * 3.0.0", fetched 2026-09-15): `Payment.status` is declared `type: string`
 * with zero enum values and the description "A string indicating the current
 * status of the payment, most commonly \"settled\" or \"authed\"." The whole
 * spec contains exactly one status enum carrying settlement-like values, and
 * it belongs to `ShopReceipt`, not to a payment.
 *
 * So there is no fuller list to extend this switch to, and `'unknown'` is the
 * honest answer for anything else rather than a gap — "most commonly" is the
 * vendor telling us the set is open. Mapping an unlisted value to a guessed
 * `TransactionStatus` would invent precision Etsy does not offer.
 */
function mapPaymentStatus(status: string | undefined): TransactionStatus {
  switch (status) {
    case 'settled':
      return 'SUCCESS'
    case 'authed':
      return 'PENDING'
    default:
      return 'unknown'
  }
}

/**
 * Adjustment state comes from `is_success`, not `status`, and the same spec
 * fetch is why that is the right way round rather than a coin-flip:
 *
 *   is_success  boolean  "When true, the payment adjustment was or is likely
 *                         to complete successfully."
 *   status      string   "The status string of the payment adjustment."
 *
 * One has documented semantics; the other is an unenumerated free string
 * described only as itself. `PaymentAdjustment` declares no enum on any
 * property.
 */
function mapAdjustmentStatus(isSuccess: boolean | undefined): TransactionStatus {
  if (isSuccess === true) return 'SUCCESS'
  if (isSuccess === false) return 'FAILURE'
  return 'unknown'
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Etsy Payment → canonical SALE Transaction.
 */
export function transformPayment(payment: RawEtsyPayment): Transaction {
  const processedAt = tsToIso(payment.created_timestamp)
  return {
    id: String(payment.payment_id),
    orderId: payment.receipt_id != null ? String(payment.receipt_id) : undefined,
    kind: 'SALE',
    status: mapPaymentStatus(payment.status),
    amount: etsyMoneyToCanonical(payment.amount_gross),
    processedAt,
    createdAt: processedAt,
    metadata: payment as unknown as Record<string, unknown>,
  }
}

/**
 * Etsy PaymentAdjustment → canonical REFUND Transaction, pointing back at the
 * Payment it adjusts via `parentTransactionId`.
 */
export function transformPaymentAdjustment(
  payment: RawEtsyPayment,
  adjustment: RawEtsyPaymentAdjustment,
): Transaction {
  const processedAt = tsToIso(adjustment.created_timestamp)
  const paymentId = adjustment.payment_id != null ? adjustment.payment_id : payment.payment_id
  return {
    id: String(adjustment.payment_adjustment_id),
    orderId: payment.receipt_id != null ? String(payment.receipt_id) : undefined,
    kind: 'REFUND',
    status: mapAdjustmentStatus(adjustment.is_success),
    amount: etsyMoneyToCanonical(adjustment.total_adjustment_amount),
    parentTransactionId: paymentId != null ? String(paymentId) : undefined,
    processedAt,
    createdAt: processedAt,
    metadata: adjustment as unknown as Record<string, unknown>,
  }
}

/**
 * Flatten one Payment into its SALE transaction plus a REFUND transaction
 * for each of its `payment_adjustments[]` entries.
 */
export function transformTransactions(payment: RawEtsyPayment): Transaction[] {
  const sale = transformPayment(payment)
  const adjustments = payment.payment_adjustments
  if (!adjustments || adjustments.length === 0) return [sale]
  return [sale, ...adjustments.map((adjustment) => transformPaymentAdjustment(payment, adjustment))]
}
