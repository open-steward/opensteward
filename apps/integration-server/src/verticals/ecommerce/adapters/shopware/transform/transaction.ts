/**
 * Shopware 6 Order Transaction → canonical Transaction.
 *
 * Shopware order transactions live under `/api/order-transaction`.
 * Each transaction has:
 *  - `amount.totalPrice` — transaction amount.
 *  - `stateMachineState.technicalName` — payment state:
 *    open, authorized, paid, refunded, cancelled, failed, ...
 *  - `paymentMethod` — association with method details.
 *  - `orderId` — link to parent order.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

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
    amount: amount != null ? { amount: majorToMinor(amount, currency), currency } : undefined,
    gateway: raw.paymentMethod?.name ?? raw.paymentMethod?.shortName ?? undefined,
    processedAt: toIsoDatetime(raw.createdAt),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
