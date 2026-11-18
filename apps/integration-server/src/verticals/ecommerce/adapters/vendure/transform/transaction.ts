/**
 * Vendure Payment -> canonical Transaction.
 *
 * Vendure does not expose a top-level `payments` or `listPayments` GraphQL
 * query. Payments are only accessible as `order.payments[]`.  This makes
 * transactions a *derived* resource: they are read from the payments
 * embedded inside an order query.
 *
 * Composite id: `{orderId}:{paymentId}`.
 *
 * Vendure payment states:
 *   Created → Authorized → Settled → Cancelled / Error
 * These map to the canonical TransactionKind + TransactionStatus as follows:
 *
 *   state=Authorized  → kind=AUTHORIZATION, status=SUCCESS
 *   state=Settled     → kind=SALE,          status=SUCCESS
 *   state=Cancelled   → kind=VOID,          status=SUCCESS
 *   state=Error       → kind=SALE,          status=FAILURE
 *   (all others)      → kind=SALE,          status=PENDING
 *
 * Amounts: Vendure stores money as integer minor-units (cents), matching the
 * canonical MoneySchema representation directly.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

// -- Raw shape ---------------------------------------------------------------

export interface RawVendurePayment {
  id: string
  method?: string
  /** Amount in minor units (cents). */
  amount?: number
  state?: string
  transactionId?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// -- State mapping -----------------------------------------------------------

interface KindStatus {
  kind: TransactionKind
  status: TransactionStatus
}

function mapState(state: string | undefined): KindStatus {
  switch ((state ?? '').toLowerCase()) {
    case 'authorized':
      return { kind: 'AUTHORIZATION', status: 'SUCCESS' }
    case 'settled':
      return { kind: 'SALE', status: 'SUCCESS' }
    case 'cancelled':
      return { kind: 'VOID', status: 'SUCCESS' }
    case 'error':
      return { kind: 'SALE', status: 'FAILURE' }
    default:
      return { kind: 'SALE', status: 'PENDING' }
  }
}

// -- Transform ---------------------------------------------------------------

export function transformTransaction(
  raw: RawVendurePayment,
  orderId: string,
  currency: string = 'USD',
): Transaction {
  const { kind, status } = mapState(raw.state)
  return {
    id: `${orderId}:${raw.id}`,
    orderId,
    kind,
    status,
    amount: raw.amount != null
      ? { amount: Math.round(raw.amount), currency }
      : undefined,
    gateway: raw.method ?? undefined,
    authorizationCode: raw.transactionId ?? undefined,
    errorMessage: raw.errorMessage ?? undefined,
    createdAt: raw.createdAt,
    metadata: (raw.metadata ?? raw) as Record<string, unknown>,
  }
}
