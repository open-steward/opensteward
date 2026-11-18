/**
 * Kibo Commerce Payment Transaction → canonical Transaction.
 *
 * Kibo payment transactions live at:
 *   GET /api/commerce/orders/{orderId}/payments
 *
 * Key fields:
 *   - `id`/`paymentId`    → id
 *   - `orderId`           → orderId
 *   - `paymentType`       → kind
 *   - `status`            → status
 *   - `amountCollected`   → amount
 *   - `paymentWorkflow`   → gateway
 *   - `auditInfo`         → createdAt
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawKiboPayment {
  id?: string
  paymentId?: string
  orderId?: string
  paymentType?: string
  status?: string
  amountCollected?: number
  amountCredited?: number
  amountRequested?: number
  currencyCode?: string
  paymentWorkflow?: string
  billingInfo?: {
    card?: {
      paymentOrCardType?: string
      cardNumberPartOrMask?: string
    }
    [key: string]: unknown
  }
  auditInfo?: { createDate?: string; updateDate?: string }
  [key: string]: unknown
}

function mapKind(t: string | undefined): TransactionKind | undefined {
  const v = (t ?? '').toUpperCase()
  if (v === 'CREDITCARD' || v === 'CHECK' || v === 'CASH' || v === 'PURCHASEORDER') return 'SALE'
  if (v === 'STORECREDIT' || v === 'GIFTCARD') return 'SALE'
  return 'SALE'
}

function mapStatus(s: string | undefined): TransactionStatus | undefined {
  const v = (s ?? '').toUpperCase()
  if (v === 'COLLECTED' || v === 'CREDITED' || v === 'AUTHORIZED') return 'SUCCESS'
  if (v === 'DECLINED' || v === 'FAILED' || v === 'VOIDED') return 'FAILURE'
  if (v === 'NEW' || v === 'PENDING' || v === 'ROLLBACK') return 'PENDING'
  return undefined
}

export function transformTransaction(raw: RawKiboPayment, orderId?: string): Transaction {
  const id = raw.id ?? raw.paymentId ?? ''
  const currency = raw.currencyCode ?? 'USD'
  const amount = raw.amountCollected ?? raw.amountRequested ?? 0

  return {
    id,
    orderId: raw.orderId ?? orderId ?? undefined,
    kind: mapKind(raw.paymentType),
    status: mapStatus(raw.status),
    amount: amount != null
      ? { amount: majorToMinor(amount, currency), currency }
      : undefined,
    gateway: raw.paymentWorkflow ?? raw.paymentType ?? undefined,
    processedAt: raw.auditInfo?.createDate ?? undefined,
    createdAt: raw.auditInfo?.createDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
