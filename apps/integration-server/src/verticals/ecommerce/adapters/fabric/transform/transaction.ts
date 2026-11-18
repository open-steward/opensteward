/**
 * fabric Transaction → canonical Transaction.
 *
 * fabric transactions endpoint: `GET /v3/orders/{orderId}/transactions`.
 * Each transaction has `kind`, `status`, `amount`, `gateway`, and metadata.
 *
 * Kind mapping:
 *   - authorization → AUTHORIZATION
 *   - capture       → CAPTURE
 *   - sale          → SALE
 *   - refund        → REFUND
 *   - void          → VOID
 *
 * Status mapping:
 *   - pending → PENDING
 *   - success → SUCCESS
 *   - failure → FAILURE
 *   - error   → ERROR
 *
 * Money values are decimal (not cents).
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal for upstream payloads. */
function minorToMajor(money: { amount: number; currency: string } | undefined):
  | number
  | undefined {
  if (money == null) return undefined
  const c = money.currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return money.amount / 10 ** exponent
}

export interface RawFabricTransaction {
  id: string
  order_id?: string
  kind?: string
  status?: string
  amount?: number
  currency?: string
  gateway?: string
  authorization_code?: string
  parent_transaction_id?: string
  error_code?: string
  error_message?: string
  processed_at?: string
  created_at?: string
  [key: string]: unknown
}

function mapKind(kind: string | undefined): TransactionKind | undefined {
  switch (kind) {
    case 'authorization': return 'AUTHORIZATION'
    case 'capture': return 'CAPTURE'
    case 'sale': return 'SALE'
    case 'refund': return 'REFUND'
    case 'void': return 'VOID'
    default: return 'unknown'
  }
}

function mapStatus(status: string | undefined): TransactionStatus | undefined {
  switch (status) {
    case 'pending': return 'PENDING'
    case 'success': return 'SUCCESS'
    case 'failure': return 'FAILURE'
    case 'error': return 'ERROR'
    default: return 'unknown'
  }
}

export function transformTransaction(raw: RawFabricTransaction): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.order_id,
    kind: mapKind(raw.kind),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    gateway: raw.gateway,
    authorizationCode: raw.authorization_code,
    parentTransactionId: raw.parent_transaction_id,
    errorCode: raw.error_code,
    errorMessage: raw.error_message,
    processedAt: raw.processed_at,
    createdAt: raw.created_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    kind: transaction.kind?.toLowerCase(),
    amount: minorToMajor(transaction.amount),
    currency: transaction.amount?.currency ?? 'USD',
    gateway: transaction.gateway,
  }
}
