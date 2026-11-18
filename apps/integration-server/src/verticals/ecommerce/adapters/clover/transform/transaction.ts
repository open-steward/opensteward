/**
 * Clover Payment → canonical Transaction.
 *
 * Clover Payments represent completed card charges at the POS.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { cloverCentsToMinor } from './product'

export interface RawCloverPayment {
  id: string
  order?: { id?: string }
  amount?: number // integer cents
  result?: string // SUCCESS, FAIL, INITIATED, VOIDED, etc.
  tender?: { label?: string }
  cardTransaction?: {
    authCode?: string
    type?: string // AUTH, PREAUTH, CREDIT, etc.
  }
  refunds?: { elements?: Array<{ id?: string }> }
  createdTime?: number
  modifiedTime?: number
  [key: string]: unknown
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  SUCCESS: 'SUCCESS',
  FAIL: 'FAILURE',
  INITIATED: 'PENDING',
  VOIDED: 'FAILURE',
}

function mapKind(raw: RawCloverPayment): TransactionKind {
  const type = raw.cardTransaction?.type?.toUpperCase()
  if (type === 'AUTH' || type === 'PREAUTH') return 'AUTHORIZATION'
  return 'SALE'
}

export function transformTransaction(raw: RawCloverPayment): Transaction {
  const currency = 'USD'
  return {
    id: raw.id,
    orderId: raw.order?.id ?? undefined,
    kind: mapKind(raw),
    status: raw.result ? STATUS_MAP[raw.result.toUpperCase()] ?? undefined : undefined,
    amount: raw.amount != null
      ? { amount: cloverCentsToMinor(raw.amount), currency }
      : undefined,
    gateway: raw.tender?.label ? `clover_${raw.tender.label.toLowerCase().replace(/\s+/g, '_')}` : 'clover',
    authorizationCode: raw.cardTransaction?.authCode ?? undefined,
    processedAt: raw.createdTime ? new Date(raw.createdTime).toISOString() : undefined,
    createdAt: raw.createdTime ? new Date(raw.createdTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
