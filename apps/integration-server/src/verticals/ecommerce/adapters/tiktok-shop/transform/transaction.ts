/**
 * TikTok Shop finance payment → canonical Transaction.
 *
 * TikTok Shop exposes financial payment records through the Finance API.
 * The `/finance/202309/payments` endpoint returns settled payment records
 * (buyer payments to the platform) which map to canonical SALE transactions.
 *
 * Endpoint: GET /finance/202309/payments
 * Per-order: GET /finance/202309/orders/{order_id}/statement_transactions
 * Docs: https://partner.tiktokshop.com/docv2/page/finance-api-overview
 *
 * Payment status values (from datavirtuality connector docs):
 *   SUCCEEDED — payment completed
 *   PENDING   — payment in progress
 *   FAILED    — payment failed
 *
 * Note: TikTok Shop Finance API covers settlements and payments, not
 * authorization/capture lifecycle events. All payments are mapped as SALE.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTikTokPayment {
  id: string
  /** Amount fields from Finance_Payments (datavirtuality connector verified). */
  amount_currency?: string
  amount_value?: string | number
  /** Settlement amount — what seller actually receives. */
  settlement_amount_currency?: string
  settlement_amount_value?: string | number
  status?: string
  create_time?: number
  paid_time?: number
  order_id?: string
  bank_account?: string
  exchange_rate?: string | number
  [key: string]: unknown
}

export interface RawTikTokStatementTransaction {
  id: string
  order_id?: string
  type?: string
  status?: string
  currency?: string
  amount?: string | number
  create_time?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapPaymentStatus(status: string | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'SUCCEEDED':
    case 'SUCCESS':
      return 'SUCCESS'
    case 'PENDING':
      return 'PENDING'
    case 'FAILED':
    case 'FAILURE':
      return 'FAILURE'
    default:
      return undefined
  }
}

function mapTransactionKind(type: string | undefined): TransactionKind | undefined {
  if (!type) return 'SALE'
  switch (type.toUpperCase()) {
    case 'REFUND':
    case 'CHARGE_BACK':
      return 'REFUND'
    case 'CAPTURE':
      return 'CAPTURE'
    case 'VOID':
    case 'REVERSAL':
      return 'VOID'
    default:
      return 'SALE'
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

/**
 * Transform a Finance_Payments record (GET /finance/202309/payments).
 */
export function transformPayment(raw: RawTikTokPayment): Transaction {
  const currency = raw.amount_currency ?? raw.settlement_amount_currency ?? 'USD'
  const amountValue = toNum(raw.amount_value)

  return {
    id: raw.id,
    orderId: raw.order_id ?? undefined,
    kind: 'SALE' as TransactionKind,
    status: mapPaymentStatus(raw.status),
    amount:
      amountValue !== 0
        ? { amount: majorToMinor(amountValue, currency), currency }
        : undefined,
    gateway: 'tiktok-shop',
    processedAt: raw.paid_time
      ? new Date(raw.paid_time * 1000).toISOString()
      : undefined,
    createdAt: raw.create_time
      ? new Date(raw.create_time * 1000).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a statement transaction record
 * (GET /finance/202309/orders/{id}/statement_transactions).
 */
export function transformStatementTransaction(
  raw: RawTikTokStatementTransaction,
): Transaction {
  const currency = raw.currency ?? 'USD'
  const amountValue = toNum(raw.amount)

  return {
    id: raw.id,
    orderId: raw.order_id ?? undefined,
    kind: mapTransactionKind(raw.type),
    status: mapPaymentStatus(raw.status),
    amount:
      amountValue !== 0
        ? { amount: majorToMinor(Math.abs(amountValue), currency), currency }
        : undefined,
    gateway: 'tiktok-shop',
    createdAt: raw.create_time
      ? new Date(raw.create_time * 1000).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
