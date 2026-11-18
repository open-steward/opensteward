/**
 * NHN Commerce (Shopby) Payment Info → canonical Transaction.
 *
 * Shopby does not expose individual payment/transaction records via the shop
 * API. Payment meta is embedded inside the order response via `payType` and
 * `pgType`. We synthesize a single Transaction from an order.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from './product'
import type { RawNhnOrder, RawNhnOrderAmount } from './order'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(amount: number | undefined | null, currency = DEFAULT_CURRENCY) {
  return { amount: majorToMinor(amount ?? 0, currency), currency }
}

const KIND_MAP: Record<string, TransactionKind> = {
  CREDIT_CARD: 'SALE',
  BANK_TRANSFER: 'SALE',
  VIRTUAL_ACCOUNT: 'SALE',
  ACCUMULATION: 'SALE',
  MOBILE: 'SALE',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  PAY_DONE: 'SUCCESS',
  DEPOSIT_WAIT: 'PENDING',
  CANCEL_DONE: 'SUCCESS',
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Synthesize a Transaction from an order's payment meta.
 * Shopby does not have a dedicated transaction resource — we derive one per
 * order from `payType` and `lastOrderAmt`.
 */
export function transformOrderTransaction(
  raw: RawNhnOrder,
  currency = DEFAULT_CURRENCY,
): Transaction {
  const amounts: RawNhnOrderAmount = raw.lastOrderAmt ?? raw.firstOrderAmt ?? {}
  const orderStatus = raw.orderOptions?.[0]?.orderStatusType ?? ''

  return {
    id: raw.orderNo,
    orderId: raw.orderNo,
    kind: KIND_MAP[raw.payType ?? ''] ?? undefined,
    status: STATUS_MAP[orderStatus] ?? undefined,
    amount: amounts.payAmt != null ? toMoney(amounts.payAmt, currency) : undefined,
    gateway: raw.payType ?? undefined,
    processedAt: toIsoDatetime(raw.orderYmdt),
    createdAt: toIsoDatetime(raw.orderYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
