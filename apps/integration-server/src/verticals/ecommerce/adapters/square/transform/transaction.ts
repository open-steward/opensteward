/**
 * Square Payment → canonical Transaction.
 *
 * Square Payments API models card charges / payments. We map these to
 * the canonical Transaction schema.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { squareMoneyToDecimal } from './product'

export interface RawSquarePaymentMoney {
  amount?: number
  currency?: string
}

export interface RawSquarePayment {
  id: string
  order_id?: string
  amount_money?: RawSquarePaymentMoney
  status?: string // COMPLETED, APPROVED, PENDING, CANCELED, FAILED
  source_type?: string // CARD, BANK_ACCOUNT, WALLET, etc.
  card_details?: {
    auth_result_code?: string
    card?: { card_brand?: string }
    [key: string]: unknown
  }
  processing_fee?: Array<{ amount_money?: RawSquarePaymentMoney }>
  refund_ids?: string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  COMPLETED: 'SUCCESS',
  APPROVED: 'SUCCESS',
  PENDING: 'PENDING',
  CANCELED: 'FAILURE',
  FAILED: 'FAILURE',
}

function mapKind(status: string | undefined): TransactionKind {
  // Square Payments are always sale-type captures
  if (status === 'APPROVED') return 'AUTHORIZATION'
  return 'SALE'
}

export function transformTransaction(raw: RawSquarePayment): Transaction {
  const currency = raw.amount_money?.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.order_id ?? undefined,
    kind: mapKind(raw.status),
    status: raw.status ? STATUS_MAP[raw.status.toUpperCase()] ?? undefined : undefined,
    amount: raw.amount_money?.amount != null
      ? {
          amount: squareMoneyToDecimal(raw.amount_money.amount, currency),
          currency,
        }
      : undefined,
    gateway: raw.source_type ? `square_${raw.source_type.toLowerCase()}` : 'square',
    authorizationCode: raw.card_details?.auth_result_code ?? undefined,
    processedAt: raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
