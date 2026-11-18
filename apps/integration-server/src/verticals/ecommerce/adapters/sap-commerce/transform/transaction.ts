/**
 * SAP Commerce Cloud PaymentTransaction → canonical Transaction.
 *
 * SAP Commerce tracks payment transactions on order payment info.
 * The OCC API exposes limited payment data; full payment details
 * are typically managed through payment service providers.
 *
 * This transform maps order payment info to canonical transactions.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSapPaymentTransaction {
  id?: string
  code?: string
  paymentProvider?: string
  amount?: { value?: number; currencyIso?: string }
  transactionType?: string
  transactionStatus?: string
  transactionStatusDetails?: string
  time?: string
  orderId?: string
  [key: string]: unknown
}

function mapTransactionKind(type: string | undefined): TransactionKind {
  const t = (type ?? '').toLowerCase()
  if (t.includes('authorization') || t.includes('auth')) return 'AUTHORIZATION'
  if (t.includes('capture')) return 'CAPTURE'
  if (t.includes('refund')) return 'REFUND'
  if (t.includes('void') || t.includes('cancel')) return 'VOID'
  return 'SALE'
}

function mapTransactionStatus(status: string | undefined): TransactionStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('accepted') || s.includes('success')) return 'SUCCESS'
  if (s.includes('rejected') || s.includes('fail')) return 'FAILURE'
  if (s.includes('error')) return 'ERROR'
  return 'PENDING'
}

export function transformTransaction(
  raw: RawSapPaymentTransaction,
  orderId?: string,
): Transaction {
  return {
    id: raw.id ?? raw.code ?? '',
    orderId: orderId ?? raw.orderId,
    kind: mapTransactionKind(raw.transactionType),
    status: mapTransactionStatus(raw.transactionStatus),
    amount: raw.amount
      ? { amount: majorToMinor(raw.amount.value ?? 0, raw.amount.currencyIso ?? 'USD'), currency: raw.amount.currencyIso ?? 'USD' }
      : undefined,
    gateway: raw.paymentProvider,
    processedAt: toIsoDatetime(raw.time),
    createdAt: toIsoDatetime(raw.time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformTransaction(
  tx: Partial<Transaction>,
): Record<string, unknown> {
  return {
    paymentProvider: tx.gateway,
    amount: tx.amount
      ? { value: tx.amount.amount / 100, currencyIso: tx.amount.currency }
      : undefined,
    transactionType: tx.kind,
  }
}
