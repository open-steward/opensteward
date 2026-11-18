/**
 * Shopee wallet transaction → canonical Transaction.
 *
 * Shopee exposes seller wallet transactions via the Payment API. Each entry
 * includes a `transaction_type`, `amount`, `status`, and optional `order_sn`.
 *
 * API: GET /api/v2/payment/get_wallet_transaction_list
 * Docs: https://open.shopee.com/documents (Payment module)
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeWalletTransaction {
  /** Transaction status, e.g. COMPLETED, FAILED. */
  status?: string
  /** Transaction type string, e.g. PAY_TO_BUYER, TOPUP, WITHDRAWAL, ADJUSTMENT. */
  transaction_type?: string
  /** Transaction amount in major currency units. */
  amount?: number
  /** Current balance after this transaction. */
  current_balance?: number
  /** Unix timestamp of when the transaction was created. */
  create_time?: number
  /** Associated order serial number (if transaction is order-related). */
  order_sn?: string
  /** Return SN if this transaction is a refund. */
  refund_sn?: string
  /** Transaction fee. */
  transaction_fee?: number
  /** Description (for topup transactions). */
  description?: string
  /** Money flow direction: MONEY_IN or MONEY_OUT. */
  money_flow?: string
  /** Withdrawal ID. */
  withdrawal_id?: number
  /** Transaction title (adjustment centre). */
  txn_title?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TRANSACTION_TYPE_MAP: Record<string, TransactionKind> = {
  PAY_TO_BUYER: 'REFUND',
  TOPUP: 'CAPTURE',
  WITHDRAWAL: 'VOID',
  PAYMENT: 'SALE',
  ESCROW_RELEASE: 'CAPTURE',
  ADJUSTMENT: 'SALE',
}

function mapKind(
  transactionType: string | undefined,
  moneyFlow: string | undefined,
  refundSn: string | undefined,
): TransactionKind | undefined {
  if (!transactionType) return undefined

  // Explicit refund marker
  if (refundSn) return 'REFUND'

  const upper = transactionType.toUpperCase()
  for (const [key, kind] of Object.entries(TRANSACTION_TYPE_MAP)) {
    if (upper.includes(key)) return kind
  }

  // Fallback: use money_flow direction
  if (moneyFlow === 'MONEY_OUT') return 'REFUND'
  if (moneyFlow === 'MONEY_IN') return 'SALE'

  return undefined
}

function mapStatus(status: string | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return 'SUCCESS'
    case 'FAILED':
    case 'FAILURE':
      return 'FAILURE'
    case 'PENDING':
      return 'PENDING'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Shopee does not provide an explicit currency field on wallet transaction list
 * entries. The currency is inferred from the shop's currency configured at
 * higher layers and injected here as a parameter.
 */
export function transformTransaction(
  raw: RawShopeeWalletTransaction,
  currency = 'USD',
): Transaction {
  const id =
    raw.withdrawal_id != null
      ? String(raw.withdrawal_id)
      : raw.order_sn
        ? `${raw.order_sn}:${raw.create_time ?? 0}`
        : String(raw.create_time ?? Math.random())

  return {
    id,
    orderId: raw.order_sn ?? raw.refund_sn,
    kind: mapKind(raw.transaction_type, raw.money_flow, raw.refund_sn),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null
        ? { amount: majorToMinor(Math.abs(raw.amount), currency), currency }
        : undefined,
    gateway: 'shopee_payments',
    authorizationCode: undefined,
    parentTransactionId: raw.refund_sn,
    errorCode: undefined,
    errorMessage: undefined,
    processedAt:
      raw.create_time != null
        ? new Date(raw.create_time * 1000).toISOString()
        : undefined,
    createdAt:
      raw.create_time != null
        ? new Date(raw.create_time * 1000).toISOString()
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
