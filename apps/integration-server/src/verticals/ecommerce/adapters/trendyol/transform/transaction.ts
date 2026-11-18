/**
 * Trendyol settlement → canonical Transaction.
 *
 * Trendyol exposes seller financial settlements via:
 *   GET /integration/finance/che/sellers/{sellerId}/settlements
 *
 * Each settlement record represents a single line in the seller's account
 * statement — a sale, return, commission charge, or payment. The endpoint
 * requires a date range (max 15-day window) and returns paginated results.
 *
 * Key mapping decisions:
 *
 *   id               → Transaction.id
 *   orderNumber      → Transaction.orderId
 *   transactionDate  → Transaction.processedAt / Transaction.createdAt (epoch ms)
 *   transactionType  → mapped to canonical TransactionKind
 *     "Sale"         → SALE
 *     "Return"       → REFUND
 *   sellerRevenue    → Transaction.amount (positive for sale, negative for return)
 *   credit           → used when sellerRevenue unavailable
 *   debt             → used as negative amount for charge-back type records
 *   affiliate        → Transaction.gateway (marketplace identifier)
 *
 * The settlements endpoint uses the paged envelope:
 *   { content: T[], page, size, totalPages, totalElements }
 *
 * Note: startDate and endDate query params (epoch ms) are REQUIRED. The
 * interval must not exceed 15 days. Callers must supply these via params.updatedAfter
 * (listParams supplies startDate from it) plus a computed endDate.
 *
 * Docs: https://developers.trendyol.com/v3.0/docs/1current-account-statement-integration
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Trendyol shapes ──────────────────────────────────────────────────────

export interface RawTrendyolSettlement {
  id: number | string
  transactionDate?: number | null
  barcode?: string | null
  transactionType?: string | null
  receiptId?: number | string | null
  description?: string | null
  debt?: number | null
  credit?: number | null
  paymentPeriod?: number | null
  commissionRate?: number | null
  commissionAmount?: number | null
  commissionInvoiceSerialNumber?: string | null
  sellerRevenue?: number | null
  orderNumber?: string | null
  paymentOrderId?: number | string | null
  paymentDate?: number | null
  sellerId?: number | string | null
  storeId?: number | string | null
  storeName?: string | null
  storeAddress?: string | null
  country?: string | null
  orderDate?: number | null
  affiliate?: string | null
  shipmentPackageId?: number | string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapKind(transactionType: string | null | undefined): TransactionKind | undefined {
  if (!transactionType) return undefined
  switch (transactionType.toLowerCase()) {
    case 'sale':
    case 'satiş':
    case 'satış':
      return 'SALE'
    case 'return':
    case 'iade':
      return 'REFUND'
    default:
      return undefined
  }
}

function mapStatus(_transactionType: string | null | undefined): TransactionStatus {
  // Settlement records are already settled/completed — always SUCCESS.
  return 'SUCCESS'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawTrendyolSettlement): Transaction {
  // Prefer sellerRevenue for the canonical amount; fall back to credit/debt.
  const revenue = toNum(raw.sellerRevenue)
  const credit = toNum(raw.credit)
  const debt = toNum(raw.debt)
  // Net amount: sellerRevenue if set, otherwise credit minus debt.
  const netMajor = revenue !== 0 ? revenue : credit - debt
  const currency = 'TRY' // Trendyol Turkey settlements are always TRY

  const kind = mapKind(raw.transactionType)

  return {
    id: String(raw.id),
    orderId: raw.orderNumber ?? undefined,
    kind,
    status: mapStatus(raw.transactionType),
    amount:
      netMajor !== 0
        ? { amount: majorToMinor(netMajor, currency), currency }
        : undefined,
    gateway: raw.affiliate ?? undefined,
    authorizationCode:
      raw.receiptId != null ? String(raw.receiptId) : undefined,
    processedAt: toIsoDatetime(raw.transactionDate),
    createdAt: toIsoDatetime(raw.transactionDate ?? raw.orderDate),
    metadata: raw as Record<string, unknown>,
  }
}
