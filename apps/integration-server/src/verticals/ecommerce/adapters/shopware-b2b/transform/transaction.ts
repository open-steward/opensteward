/**
 * Shopware B2B Suite Order Transaction → canonical Transaction.
 *
 * Identical to base Shopware 6 — B2B Suite does not modify transactions.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawShopwareTransaction {
  id: string
  orderId?: string
  amount?: { totalPrice?: number }
  stateMachineState?: { technicalName?: string; name?: string }
  paymentMethod?: { name?: string; id?: string; shortName?: string }
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

function mapKind(technicalName: string | undefined): TransactionKind | undefined {
  switch (technicalName) {
    case 'authorized':
      return 'AUTHORIZATION'
    case 'paid':
    case 'paid_partially':
      return 'CAPTURE'
    case 'refunded':
    case 'refunded_partially':
      return 'REFUND'
    case 'cancelled':
      return 'VOID'
    default:
      return 'SALE'
  }
}

function mapStatus(technicalName: string | undefined): TransactionStatus | undefined {
  switch (technicalName) {
    case 'open':
    case 'reminded':
    case 'in_progress':
      return 'PENDING'
    case 'authorized':
    case 'paid':
    case 'paid_partially':
    case 'refunded':
    case 'refunded_partially':
      return 'SUCCESS'
    case 'cancelled':
      return 'FAILURE'
    case 'failed':
      return 'ERROR'
    default:
      return 'PENDING'
  }
}

export function transformTransaction(
  raw: RawShopwareTransaction,
  currency: string = 'EUR',
): Transaction {
  const amount = raw.amount?.totalPrice
  const state = raw.stateMachineState?.technicalName
  return {
    id: raw.id,
    orderId: raw.orderId,
    kind: mapKind(state),
    status: mapStatus(state),
    amount: amount != null ? { amount, currency } : undefined,
    gateway: raw.paymentMethod?.name ?? raw.paymentMethod?.shortName ?? undefined,
    processedAt: toIsoDatetime(raw.createdAt),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
