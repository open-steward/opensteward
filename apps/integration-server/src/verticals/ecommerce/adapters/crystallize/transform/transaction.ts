/**
 * Crystallize Payment -> canonical Transaction.
 *
 * Crystallize orders contain a `payment` array with provider info.
 * Each payment entry maps to a canonical Transaction.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawCrystallizePayment {
  id?: string
  orderId?: string
  provider?: string | null
  providerId?: string | null
  amount?: number | null
  currency?: string | null
  method?: string | null
  status?: string | null
  createdAt?: string
  [key: string]: unknown
}

function mapKind(method: string | null | undefined): TransactionKind | undefined {
  if (!method) return 'CAPTURE'
  const lower = method.toLowerCase()
  if (lower.includes('auth')) return 'AUTHORIZATION'
  if (lower.includes('refund')) return 'REFUND'
  if (lower.includes('void') || lower.includes('cancel')) return 'VOID'
  return 'CAPTURE'
}

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  if (!status) return 'SUCCESS'
  const lower = status.toLowerCase()
  if (lower === 'success' || lower === 'completed' || lower === 'paid') return 'SUCCESS'
  if (lower === 'pending' || lower === 'processing') return 'PENDING'
  if (lower === 'failed' || lower === 'failure') return 'FAILURE'
  if (lower === 'error') return 'ERROR'
  return 'SUCCESS'
}

export function transformTransaction(raw: RawCrystallizePayment): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: raw.id ?? raw.providerId ?? '',
    orderId: raw.orderId ?? undefined,
    kind: mapKind(raw.method),
    status: mapStatus(raw.status),
    amount: raw.amount != null
      ? { amount: majorToMinor(raw.amount, currency), currency }
      : undefined,
    gateway: raw.provider ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    provider: transaction.gateway,
    amount: transaction.amount?.amount,
    currency: transaction.amount?.currency,
  }
}
