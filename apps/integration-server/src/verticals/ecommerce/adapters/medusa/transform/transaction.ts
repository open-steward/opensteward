/**
 * Medusa v2 Payment → canonical Transaction.
 *
 * Medusa v2 models payment as an `AdminPayment` object returned by
 * `GET /admin/payments` and `GET /admin/payments/{id}`. There is no
 * first-class "transaction" resource — Medusa delegates payment
 * processing to external providers (Stripe, etc.) via the Payment Module.
 *
 * Mapping strategy:
 *   - A Payment with `captured_at` → kind CAPTURE, status SUCCESS.
 *   - A Payment with `canceled_at` → kind VOID, status SUCCESS.
 *   - Otherwise (authorized but not yet captured) → kind AUTHORIZATION,
 *     status PENDING.
 *   - `amount` is the captured amount when available, else authorized_amount,
 *     else the raw payment amount. Medusa amounts are integer minor units
 *     (cents) — already canonical; pass through unchanged.
 *   - `gateway` maps from `provider_id`.
 *   - `processedAt` is `captured_at ?? canceled_at ?? created_at`.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'

export interface RawMedusaPayment {
  id: string
  amount?: number
  authorized_amount?: number | null
  captured_amount?: number | null
  refunded_amount?: number | null
  currency_code?: string
  provider_id?: string | null
  data?: Record<string, unknown> | null
  captured_at?: string | null
  canceled_at?: string | null
  created_at?: string
  updated_at?: string
  /** Present when the payment is expanded with its order context. */
  payment_collection?: { order_id?: string | null } | null
  payment_session?: { id?: string | null } | null
  [key: string]: unknown
}

function deriveKind(raw: RawMedusaPayment): TransactionKind {
  if (raw.canceled_at) return 'VOID'
  if (raw.captured_at || (raw.captured_amount != null && raw.captured_amount > 0)) {
    return 'CAPTURE'
  }
  return 'AUTHORIZATION'
}

function deriveStatus(raw: RawMedusaPayment): TransactionStatus {
  if (raw.canceled_at) return 'SUCCESS'
  if (raw.captured_at || (raw.captured_amount != null && raw.captured_amount > 0)) {
    return 'SUCCESS'
  }
  return 'PENDING'
}

export function transformTransaction(
  raw: RawMedusaPayment,
  orderId?: string,
): Transaction {
  const currency = raw.currency_code ?? 'USD'

  // Use the most specific amount available: captured > authorized > total
  const amountValue =
    raw.captured_amount != null && raw.captured_amount > 0
      ? raw.captured_amount
      : raw.authorized_amount != null && raw.authorized_amount > 0
        ? raw.authorized_amount
        : raw.amount ?? 0

  const processedAt =
    raw.captured_at ?? raw.canceled_at ?? raw.created_at ?? undefined

  const derivedOrderId =
    orderId ??
    (raw.payment_collection as { order_id?: string | null } | null | undefined)
      ?.order_id ??
    undefined

  return {
    id: raw.id,
    orderId: derivedOrderId ?? undefined,
    kind: deriveKind(raw),
    status: deriveStatus(raw),
    amount: {
      amount: Math.round(amountValue),
      currency,
    },
    gateway: raw.provider_id ?? undefined,
    authorizationCode: undefined,
    parentTransactionId: undefined,
    errorCode: undefined,
    errorMessage: undefined,
    processedAt: processedAt ?? undefined,
    createdAt: raw.created_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
