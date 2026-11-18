/**
 * eBay Finances API Transaction → canonical Transaction.
 *
 * eBay's Sell Finances API returns seller transactions:
 *   GET /sell/finances/v1/transaction → list (with filters)
 *
 * Each transaction has an `orderId`, `transactionType`, `amount`, and
 * `transactionDate`. Transaction types include SALE, REFUND, CREDIT,
 * DISPUTE, SHIPPING_LABEL, TRANSFER, etc.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEbayMoney {
  value: string
  currency: string
}

export interface RawEbayTransaction {
  transactionId: string
  orderId?: string
  transactionType?: string
  transactionStatus?: string
  amount?: RawEbayMoney
  totalFeeBasisAmount?: RawEbayMoney
  totalFeeAmount?: RawEbayMoney
  transactionDate?: string
  transactionMemo?: string
  buyer?: { username?: string }
  salesRecordReference?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_MAP: Record<string, TransactionKind> = {
  SALE: 'SALE',
  REFUND: 'REFUND',
  CREDIT: 'CAPTURE',
  DISPUTE: 'REFUND',
  SHIPPING_LABEL: 'CAPTURE',
  TRANSFER: 'CAPTURE',
  NON_SALE_CHARGE: 'CAPTURE',
  ADJUSTMENT: 'CAPTURE',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  PAYOUT: 'SUCCESS',
  FUNDS_PROCESSING: 'PENDING',
  FUNDS_AVAILABLE_FOR_PAYOUT: 'SUCCESS',
  FUNDS_ON_HOLD: 'PENDING',
  COMPLETED: 'SUCCESS',
  FAILED: 'FAILURE',
}

function toMoney(m: RawEbayMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.value)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(Math.abs(n), m.currency), currency: m.currency }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawEbayTransaction): Transaction {
  const kind = KIND_MAP[raw.transactionType ?? ''] ?? 'CAPTURE'
  const status = STATUS_MAP[raw.transactionStatus ?? ''] ?? 'SUCCESS'
  const amount = toMoney(raw.amount)

  return {
    id: raw.transactionId,
    orderId: raw.orderId,
    kind,
    status,
    amount,
    gateway: 'ebay',
    processedAt: raw.transactionDate,
    createdAt: raw.transactionDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
