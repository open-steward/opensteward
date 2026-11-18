/**
 * commercetools Payment.Transaction → canonical Transaction.
 *
 * commercetools payments are independent resources referenced from an
 * order's `paymentInfo.payments[]`. Each payment holds a `transactions[]`
 * array (Authorization / CancelAuthorization / Charge / Refund /
 * Chargeback). The canonical id is the composite `paymentId:transactionId`
 * so a single getTransaction round-trip can locate the record.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { moneyFromCt, type RawCtMoney } from './variant'

export interface RawCtTransaction {
  id: string
  timestamp?: string
  type: string // Authorization | CancelAuthorization | Charge | Refund | Chargeback
  amount: RawCtMoney
  interactionId?: string
  state?: string // Initial | Pending | Success | Failure
}

export interface RawCtPayment {
  id: string
  version?: number
  key?: string
  customer?: { id: string; typeId: 'customer' }
  amountPlanned?: RawCtMoney
  paymentMethodInfo?: { paymentInterface?: string; method?: string; name?: string }
  transactions: RawCtTransaction[]
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

const KIND_MAP: Record<string, TransactionKind> = {
  Authorization: 'AUTHORIZATION',
  CancelAuthorization: 'VOID',
  Charge: 'CAPTURE',
  Refund: 'REFUND',
  Chargeback: 'REFUND',
}

const STATE_MAP: Record<string, TransactionStatus> = {
  Initial: 'PENDING',
  Pending: 'PENDING',
  Success: 'SUCCESS',
  Failure: 'FAILURE',
}

/**
 * Convert a commercetools Payment + nested Transaction into the canonical
 * shape. `orderId` must be supplied by the caller (the payment itself
 * does not back-reference its order).
 */
export function transformTransaction(
  payment: RawCtPayment,
  tx: RawCtTransaction,
  orderId?: string,
): Transaction {
  return {
    id: `${payment.id}:${tx.id}`,
    orderId,
    kind: KIND_MAP[tx.type],
    status: tx.state ? STATE_MAP[tx.state] ?? undefined : undefined,
    amount: moneyFromCt(tx.amount),
    gateway: payment.paymentMethodInfo?.paymentInterface,
    authorizationCode: tx.interactionId,
    processedAt: tx.timestamp,
    createdAt: payment.createdAt,
    metadata: { payment, transaction: tx } as unknown as Record<string, unknown>,
  }
}

/**
 * Expand a commercetools Payment into canonical Transaction[] — one per
 * nested transaction.
 */
export function transformPayment(payment: RawCtPayment, orderId?: string): Transaction[] {
  return (payment.transactions ?? []).map((tx) => transformTransaction(payment, tx, orderId))
}

/**
 * Canonical Transaction → commercetools `addTransaction` action body,
 * suitable for `POST /payments/{paymentId}` with `{version, actions:
 * [{action: 'addTransaction', transaction: ...}]}`.
 */
export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  const kindToType: Record<string, string> = {
    AUTHORIZATION: 'Authorization',
    CAPTURE: 'Charge',
    SALE: 'Charge',
    REFUND: 'Refund',
    VOID: 'CancelAuthorization',
  }
  return {
    type: transaction.kind ? kindToType[transaction.kind] : undefined,
    amount: transaction.amount
      ? {
          type: 'centPrecision',
          currencyCode: transaction.amount.currency,
          centAmount: Math.round(transaction.amount.amount),
        }
      : undefined,
    interactionId: transaction.authorizationCode,
  }
}
