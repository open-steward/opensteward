/**
 * Swell payment → canonical Transaction.
 *
 * Fields read, from the payment model
 * (https://developers.swell.is/backend-api/payments):
 *   id, order_id ("ID of the order the payment was applied to, if
 *   applicable."), amount ("Payment amount denominated in currency."),
 *   currency ("Three-letter ISO currency code in uppercase."), gateway ("ID of
 *   the payment gateway that was used to process the payment."), status
 *   ("Can be pending, which is awaiting async processing, error, success or
 *   authorized." — enum values pending, void, error, success, authorized),
 *   authorized ("Indicates the payment was authorized before being
 *   captured."), captured ("Indicates the payment has been captured."),
 *   error { code, message }, date_created.
 *
 * Kind: an `authorized` or `void` status is that kind; a captured payment is
 * a CAPTURE when it was authorized first and a SALE otherwise. Money needs
 * both `amount` and `currency`, or it is omitted.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawSwellPayment {
  id: string
  order_id?: string | null
  amount?: number | null
  currency?: string | null
  gateway?: string | null
  status?: string | null
  authorized?: boolean | null
  captured?: boolean | null
  error?: { message?: string | null; code?: string | null } | null
  date_created?: string | null
  [key: string]: unknown
}

function mapKind(raw: RawSwellPayment): TransactionKind | undefined {
  if (raw.status === 'void') return 'VOID'
  if (raw.status === 'authorized') return 'AUTHORIZATION'
  if (raw.captured === true) return raw.authorized === true ? 'CAPTURE' : 'SALE'
  return undefined
}

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  switch (status) {
    case undefined:
    case null:
      return undefined
    case 'pending':
      return 'PENDING'
    case 'error':
      return 'ERROR'
    case 'success':
    case 'authorized':
    case 'void':
      return 'SUCCESS'
    default:
      return 'unknown'
  }
}

export function transformTransaction(raw: RawSwellPayment): Transaction {
  const currency = raw.currency ?? undefined
  return {
    id: raw.id,
    orderId: raw.order_id ?? undefined,
    kind: mapKind(raw),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null && currency
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    gateway: raw.gateway ?? undefined,
    errorCode: raw.error?.code ?? undefined,
    errorMessage: raw.error?.message ?? undefined,
    createdAt: raw.date_created ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformTransaction(transaction: Partial<Transaction>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (transaction.amount?.amount != null) body['amount'] = transaction.amount.amount
  if (transaction.gateway !== undefined) body['gateway'] = transaction.gateway
  if (transaction.orderId !== undefined) body['order_id'] = transaction.orderId
  return body
}
