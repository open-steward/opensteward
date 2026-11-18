/**
 * Tmall / TOP trade payment → canonical Transaction.
 *
 * TOP exposes payment/financial details via `taobao.trade.amount.get`.
 * This method returns the payment amounts for a single trade including
 * `alipay_no`, `total_fee`, `payment`, `pay_time`, and `commission_fee`.
 *
 * Since TOP has no dedicated transaction list endpoint, `listTransactions`
 * projects transactions from trade (order) data returned by
 * `taobao.trades.sold.get`. Each trade maps to a single SALE transaction
 * when it has a `payment` field (i.e. the buyer has paid).
 *
 * The canonical `id` is the `tid` (trade id) prefixed with `txn_` to
 * distinguish it from the order id. The `alipay_no` (Alipay transaction
 * number) is preserved in `authorizationCode` and `metadata`.
 *
 * `payment` is a CNY decimal string returned by TOP (e.g. "128.00").
 * It is converted to a number for the canonical MoneySchema.
 *
 * Transaction kind mapping:
 *   Trade with pay_time set → SALE
 *   Trade closed/cancelled  → VOID
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

/**
 * Fields from `taobao.trade.amount.get` and `taobao.trades.sold.get`
 * that are relevant to constructing a Transaction.
 */
export interface RawTmallTradeAmount {
  /** Trade (order) id — primary identifier. */
  tid?: string | number
  /** Alipay transaction number. */
  alipay_no?: string
  /** Trade creation time (yyyy-MM-dd HH:mm:ss). */
  created?: string
  /** Buyer payment time (yyyy-MM-dd HH:mm:ss). */
  pay_time?: string
  /** Trade end time (yyyy-MM-dd HH:mm:ss). */
  end_time?: string
  /** Total trade fee before discounts (CNY decimal string). */
  total_fee?: string
  /** Actual payment amount after discounts (CNY decimal string). */
  payment?: string
  /** Shipping fee (CNY decimal string). */
  post_fee?: string
  /** Tmall commission fee (CNY decimal string). */
  commission_fee?: string
  /** Trade status. */
  status?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

function mapTransactionKind(status: string | undefined): TransactionKind | undefined {
  if (!status) return undefined
  const s = status.toUpperCase()
  if (s === 'TRADE_CLOSED' || s === 'TRADE_CLOSED_BY_TAOBAO') return 'VOID'
  return 'SALE'
}

function mapTransactionStatus(status: string | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  const s = status.toUpperCase()
  switch (s) {
    case 'WAIT_BUYER_PAY':
    case 'TRADE_NO_CREATE_PAY':
      return 'PENDING'
    case 'WAIT_SELLER_SEND_GOODS':
    case 'WAIT_BUYER_CONFIRM_GOODS':
    case 'TRADE_FINISHED':
      return 'SUCCESS'
    case 'TRADE_CLOSED':
    case 'TRADE_CLOSED_BY_TAOBAO':
      return 'SUCCESS'
    default:
      return undefined
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * TOP trade payment data → canonical Transaction.
 *
 * `tid` → canonical `id` (prefixed `txn_${tid}`) and `orderId`.
 * `payment` (CNY decimal) → `amount.amount`.
 * `alipay_no` → `authorizationCode` and preserved in `metadata`.
 */
export function transformTransaction(raw: RawTmallTradeAmount, currency = 'CNY'): Transaction {
  const paymentAmount = parseAmount(raw.payment)

  return {
    id: `txn_${raw.tid ?? ''}`,
    orderId: raw.tid != null ? String(raw.tid) : undefined,
    kind: mapTransactionKind(raw.status),
    status: mapTransactionStatus(raw.status),
    amount:
      paymentAmount > 0
        ? { amount: paymentAmount, currency }
        : undefined,
    gateway: 'alipay',
    authorizationCode: raw.alipay_no ?? undefined,
    processedAt: toIsoDatetime(raw.pay_time ?? raw.end_time),
    createdAt: toIsoDatetime(raw.created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a list of TOP trades into Transactions.
 */
export function transformTransactions(
  rawList: RawTmallTradeAmount[] | undefined,
  currency = 'CNY',
): Transaction[] {
  if (!rawList || rawList.length === 0) return []
  return rawList.map((r) => transformTransaction(r, currency))
}
