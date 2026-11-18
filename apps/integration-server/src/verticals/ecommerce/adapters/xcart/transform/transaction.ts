/**
 * X-Cart Order Payment Transaction → canonical Transaction.
 *
 * X-Cart exposes transactions via GET /api/orders/{order_id}/transactions.
 *
 * Key fields:
 *   id, order_id, type (auth|capture|sale|refund|void),
 *   status (Initialized|Completed|Failed|Error|Pending|InProgress|Declined|Cancelled|Void),
 *   amount (decimal), currency, payment_method, date (UNIX ts)
 */
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface XCartTransaction {
  id?: number | string
  order_id?: number | string
  type?: string | null
  status?: string | null
  amount?: number | null
  currency?: string | null
  payment_method?: string | null
  date?: number | string | null
  authorization_code?: string | null
  error_message?: string | null
  [key: string]: unknown
}

function mapKind(raw: string | null | undefined): TransactionKind | undefined {
  switch ((raw ?? '').toLowerCase()) {
    case 'auth':
    case 'authorize':
    case 'authorization':
      return 'AUTHORIZATION'
    case 'capture':
      return 'CAPTURE'
    case 'sale':
    case 'payment':
      return 'SALE'
    case 'refund':
      return 'REFUND'
    case 'void':
      return 'VOID'
    default:
      return undefined
  }
}

function mapStatus(raw: string | null | undefined): TransactionStatus | undefined {
  switch ((raw ?? '').toLowerCase()) {
    case 'completed':
    case 'success':
    case 'ok':
      return 'SUCCESS'
    case 'failed':
    case 'declined':
    case 'error':
      return 'FAILURE'
    case 'initialized':
    case 'inprogress':
    case 'pending':
      return 'PENDING'
    case 'void':
    case 'cancelled':
    case 'canceled':
      return 'FAILURE'
    default:
      return undefined
  }
}

function toIso(v: number | string | null | undefined): string | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!isFinite(n) || n === 0) return undefined
  return new Date(n * 1000).toISOString()
}

export function transformTransaction(raw: XCartTransaction, orderId?: string): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: String(raw.id ?? ''),
    orderId: orderId ?? (raw.order_id != null ? String(raw.order_id) : undefined),
    kind: mapKind(raw.type),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    gateway: raw.payment_method ?? undefined,
    authorizationCode: raw.authorization_code ?? undefined,
    errorMessage: raw.error_message ?? undefined,
    processedAt: toIso(raw.date),
    createdAt: toIso(raw.date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
