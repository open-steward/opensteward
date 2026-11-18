/**
 * Yo!Kart Payment Transaction → canonical Transaction.
 *
 * Yo!Kart records payment transactions under orders. Each transaction carries
 * the payment method, gateway reference, and status of a payment attempt.
 *
 * API paths:
 *   GET /admin/orders/transactions/{orderId}  → list transactions for an order
 *   GET /admin/transactions/view/{id}         → single transaction detail
 *
 * Money is stored in major units (decimal) and scaled to minor units on
 * the way out, using the `majorToMinor` helper from the shared schema.
 *
 * Docs: https://www.yo-kart.com/resource-center.html (API Document V2.3)
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartTransaction {
  transaction_id: number | string
  order_id?: number | string
  /** Payment gateway reference / authorization code. */
  transaction_code?: string | null
  /** Payment method identifier (e.g. 'stripe', 'paypal', 'cod'). */
  payment_method?: string | null
  /** Status: 1=success, 2=failed, 3=pending, 4=void */
  transaction_status?: string | number
  /** Transaction type: 1=sale, 2=refund, 3=auth, 4=capture */
  transaction_type?: string | number
  transaction_amount?: string | number | null
  transaction_currency?: string | null
  transaction_date?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: string | number | undefined): TransactionStatus | undefined {
  switch (String(raw ?? '').toLowerCase()) {
    case '1':
    case 'success':
    case 'completed':
      return 'SUCCESS'
    case '2':
    case 'failed':
    case 'failure':
      return 'FAILURE'
    case '3':
    case 'pending':
      return 'PENDING'
    case '4':
    case 'void':
      return 'FAILURE'
    default:
      return undefined
  }
}

function mapKind(raw: string | number | undefined): TransactionKind | undefined {
  switch (String(raw ?? '').toLowerCase()) {
    case '1':
    case 'sale':
    case 'payment':
      return 'SALE'
    case '2':
    case 'refund':
    case 'credit':
      return 'REFUND'
    case '3':
    case 'auth':
    case 'authorization':
      return 'AUTHORIZATION'
    case '4':
    case 'capture':
      return 'CAPTURE'
    default:
      return undefined
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawYokartTransaction, orderId?: string): Transaction {
  const resolvedOrderId = orderId ?? (raw.order_id != null ? String(raw.order_id) : undefined)
  const currency = (raw.transaction_currency as string | undefined) ?? 'USD'

  let amount: { amount: number; currency: string } | undefined
  if (raw.transaction_amount != null) {
    const n = typeof raw.transaction_amount === 'string'
      ? parseFloat(raw.transaction_amount)
      : raw.transaction_amount
    if (!Number.isNaN(n)) {
      amount = { amount: majorToMinor(n, currency), currency }
    }
  }

  return {
    id: String(raw.transaction_id),
    orderId: resolvedOrderId,
    kind: mapKind(raw.transaction_type),
    status: mapStatus(raw.transaction_status),
    amount,
    gateway: raw.payment_method ?? undefined,
    authorizationCode: raw.transaction_code ?? undefined,
    processedAt: toIsoDatetime(raw.transaction_date),
    createdAt: toIsoDatetime(raw.transaction_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
