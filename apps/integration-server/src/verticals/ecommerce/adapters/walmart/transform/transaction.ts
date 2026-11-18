/**
 * Walmart Recon Report JSON → canonical Transaction.
 *
 * Walmart does not expose a dedicated transaction endpoint. Instead, financial
 * transaction data is surfaced through the Recon Report JSON API:
 *   GET /v3/report/reconreport/reconFileJson
 *
 * Each entry in `reportData` represents one financial event (item charge,
 * shipping, commission, refund adjustment, etc.) for a settlement period.
 * We project each reportData record as a canonical Transaction.
 *
 * Transaction kinds derived from Walmart's `Transaction Type` field:
 *   ItemPrice / SalesTax / ShippingCharge → SALE
 *   ItemRefund / ReturnShipping           → REFUND
 *   Commission / StorageRefAdjustment     → mapped to SALE (fee captured in metadata)
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartReconRecord {
  /** Walmart settlement transaction key (unique per record). */
  'Transaction Key'?: string
  'Transaction Type'?: string
  'Transaction Description'?: string
  'Amount'?: number | string
  'Currency'?: string
  'Customer Order #'?: string
  'Purchase Order #'?: string
  'Transaction Posted Timestamp'?: string
  'Period Start Date'?: string
  'Period End Date'?: string
  'Partner Item Id'?: string
  'Partner Item Name'?: string
  [key: string]: unknown
}

export interface RawWalmartReconEnvelope {
  reportData?: RawWalmartReconRecord[]
  nextOffset?: string | number
  totalRecords?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferKind(txType: string | undefined): TransactionKind {
  if (!txType) return 'SALE'
  const upper = txType.toUpperCase()
  if (upper.includes('REFUND') || upper.includes('RETURN')) return 'REFUND'
  return 'SALE'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawWalmartReconRecord): Transaction {
  const id = raw['Transaction Key'] ?? `${raw['Purchase Order #'] ?? 'unk'}:${raw['Transaction Type'] ?? 'unk'}`
  const currency = raw['Currency'] ?? 'USD'
  const rawAmount = typeof raw['Amount'] === 'string' ? parseFloat(raw['Amount']) : (raw['Amount'] ?? 0)
  const amount = Number.isFinite(rawAmount)
    ? { amount: majorToMinor(rawAmount, currency), currency }
    : undefined
  const orderId = raw['Customer Order #'] ?? raw['Purchase Order #']

  return {
    id,
    orderId,
    kind: inferKind(raw['Transaction Type']),
    status: 'SUCCESS' as TransactionStatus,
    amount,
    gateway: 'walmart_payments',
    processedAt: raw['Transaction Posted Timestamp'],
    createdAt: raw['Transaction Posted Timestamp'],
    metadata: raw as unknown as Record<string, unknown>,
  }
}
