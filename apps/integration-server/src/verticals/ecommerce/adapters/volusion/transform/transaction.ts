/**
 * Volusion Order (payment fields) → canonical Transaction.
 *
 * Volusion has no dedicated transactions endpoint. Payment data is embedded
 * directly in each order record. This transform derives a single Transaction
 * per Order by reading the payment fields that the Volusion REST API / V1
 * export surfaces on the order object.
 *
 * Docs: Volusion V1 Orders Export — "Payment & Authorization Fields"
 *   https://help.volusion.com/s/ExportsOrdersExportDeveloper
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shape (payment fields embedded in an order) ─────────────────────────

/**
 * The subset of Volusion order fields that describe the payment transaction.
 * The full order record may carry additional fields; this interface captures
 * only the ones relevant to Transaction mapping.
 */
export interface RawVolusionOrderPayment {
  /** Volusion primary order identifier (used as the transaction id). */
  OrderID: number | string
  /** ISO-4217 currency code. */
  Currency?: string | null
  /** Grand total in decimal major units (e.g. 19.99). */
  GrandTotal?: number | string | null
  /** Declined flag — true when the payment was not approved. */
  PaymentDeclined?: boolean | null
  /** Volusion payment status string (e.g. "paid", "pending", "refunded"). */
  PaymentStatus?: string | null
  /** Gateway/method identifier (e.g. "Authorize.net", "PayPal", "Stripe"). */
  PaymentMethodID?: string | null
  /** Gateway-assigned transaction reference (e.g. a Stripe charge ID). */
  CreditCardTransactionID?: string | null
  /** Auth code returned by the card network / gateway. */
  CreditCardAuthorizationNumber?: string | null
  /** ISO-8601 datetime when the authorization was granted. */
  CreditCardAuthorizationDate?: string | null
  /** Order creation datetime (used as processedAt / createdAt fallback). */
  DateCreated?: string | null
  [key: string]: unknown
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

/**
 * Infer TransactionKind from Volusion PaymentStatus.
 *
 * Volusion does not distinguish AUTHORIZATION from CAPTURE in its API surface —
 * any non-refunded, non-declined payment is treated as a SALE.
 */
function toKind(paymentStatus: string | null | undefined, declined: boolean | null | undefined): TransactionKind {
  const s = (paymentStatus ?? '').toLowerCase()
  if (s === 'refunded' || s === 'partially_refunded') return 'REFUND'
  if (s === 'voided') return 'VOID'
  if (s === 'authorized') return 'AUTHORIZATION'
  // declined or errored orders that were attempted
  if (declined) return 'SALE'
  return 'SALE'
}

/**
 * Infer TransactionStatus from Volusion PaymentStatus / PaymentDeclined.
 */
function toStatus(paymentStatus: string | null | undefined, declined: boolean | null | undefined): TransactionStatus {
  if (declined) return 'FAILURE'
  const s = (paymentStatus ?? '').toLowerCase()
  if (s === 'pending') return 'PENDING'
  if (s === 'paid' || s === 'authorized' || s === 'refunded' || s === 'partially_refunded' || s === 'voided') return 'SUCCESS'
  if (s === 'declined' || s === 'failed') return 'FAILURE'
  return 'PENDING'
}

function toAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isNaN(n) ? 0 : (majorToMinor(n, currency) ?? 0)
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Derives a canonical Transaction from the payment-bearing fields on a
 * Volusion order response. Each order yields at most one transaction record.
 */
export function transformTransaction(raw: RawVolusionOrderPayment): Transaction {
  const currency = raw.Currency ?? 'USD'
  const amountMinor = toAmount(raw.GrandTotal, currency)
  const kind = toKind(raw.PaymentStatus, raw.PaymentDeclined)
  const status = toStatus(raw.PaymentStatus, raw.PaymentDeclined)

  return {
    id: `txn_order_${String(raw.OrderID)}`,
    orderId: String(raw.OrderID),
    kind,
    status,
    amount: amountMinor > 0 ? { amount: amountMinor, currency } : undefined,
    gateway: raw.PaymentMethodID ?? undefined,
    authorizationCode: raw.CreditCardAuthorizationNumber ?? undefined,
    parentTransactionId: undefined,
    errorCode: undefined,
    errorMessage: undefined,
    processedAt: raw.CreditCardAuthorizationDate ?? raw.DateCreated ?? undefined,
    createdAt: raw.DateCreated ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
