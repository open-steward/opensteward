/**
 * BetterCommerce Payment Transaction → canonical Transaction.
 *
 * BetterCommerce payment records live under `/api/v2/commerce/order/{id}/payment`
 * or embedded in the order as `paymentInfo`.
 *
 * Field mapping:
 *  transactionId / recordId → id
 *  orderId                  → orderId
 *  transactionType / type   → kind
 *  status / paymentStatus   → status
 *  amount / paidAmount      → amount (major → minor)
 *  currencyCode             → amount.currency
 *  gateway / paymentGateway → gateway
 *  authCode / authorization → authorizationCode
 *  errorCode                → errorCode
 *  errorMessage             → errorMessage
 *  paymentDate / createdAt  → processedAt / createdAt
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawBCTransaction {
  transactionId?: string
  recordId?: string
  orderId?: string
  transactionType?: string | null
  type?: string | null
  status?: string | null
  paymentStatus?: string | null
  amount?: number | string | null
  paidAmount?: number | string | null
  currencyCode?: string
  currency?: string
  gateway?: string | null
  paymentGateway?: string | null
  authCode?: string | null
  authorization?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  paymentDate?: string | null
  createdAt?: string
  [key: string]: unknown
}

const KIND_MAP: Record<string, TransactionKind> = {
  authorization: 'AUTHORIZATION',
  auth: 'AUTHORIZATION',
  capture: 'CAPTURE',
  sale: 'SALE',
  payment: 'SALE',
  refund: 'REFUND',
  void: 'VOID',
  cancel: 'VOID',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  pending: 'PENDING',
  success: 'SUCCESS',
  successful: 'SUCCESS',
  paid: 'SUCCESS',
  authorized: 'SUCCESS',
  failed: 'FAILURE',
  failure: 'FAILURE',
  declined: 'FAILURE',
  error: 'ERROR',
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

export function transformTransaction(raw: RawBCTransaction): Transaction {
  const currency = raw.currencyCode ?? raw.currency ?? 'GBP'
  const amountVal = raw.amount ?? raw.paidAmount
  const kindKey = (raw.transactionType ?? raw.type ?? '').toLowerCase()
  const statusKey = (raw.status ?? raw.paymentStatus ?? '').toLowerCase()

  return {
    id: raw.transactionId ?? raw.recordId ?? '',
    orderId: raw.orderId ?? undefined,
    kind: KIND_MAP[kindKey] ?? undefined,
    status: STATUS_MAP[statusKey] ?? undefined,
    amount:
      amountVal != null
        ? { amount: majorToMinor(toNum(amountVal), currency), currency }
        : undefined,
    gateway: raw.gateway ?? raw.paymentGateway ?? undefined,
    authorizationCode: raw.authCode ?? raw.authorization ?? undefined,
    errorCode: raw.errorCode ?? undefined,
    errorMessage: raw.errorMessage ?? undefined,
    processedAt: raw.paymentDate ?? raw.createdAt,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Transaction → BetterCommerce payment body. */
export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    transactionType: transaction.kind?.toLowerCase(),
    // transaction.amount.amount is integer minor units; BC expects major-unit decimal.
    amount: minorToMajor(transaction.amount?.amount, transaction.amount?.currency),
    currencyCode: transaction.amount?.currency,
    gateway: transaction.gateway,
  }
}
