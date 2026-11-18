/**
 * Daraz finance transaction → canonical Transaction.
 *
 * Daraz (via the Lazada Open Platform shared infrastructure) exposes seller
 * financial transactions via `/finance/transaction/details/get`.
 *
 * Documented response fields (per Lazada Seller Center API docs):
 *   transaction_date  — ISO-like timestamp string
 *   transaction_type  — string: e.g. "Order", "Fee", "Refund", "Adjustment"
 *   transaction_number — platform transaction reference
 *   amount            — decimal string (positive = credit, negative = debit)
 *   statement         — human-readable description
 *   paid_status       — "1" (paid) | "0" (pending)
 *   order_no          — associated order number (may be empty)
 *   order_item_no     — associated order item id
 *   shipment_type     — e.g. "Dropshipping"
 *   shipment_provider — carrier name
 *   reference_id      — external reference
 *
 * Endpoint: GET /finance/transaction/details/get
 * Parameters: trans_type (optional int), start_time, end_time, limit, offset
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawDarazTransaction {
  /** ISO-like timestamp: e.g. "2024-03-15 10:30:00" or epoch ms. */
  transaction_date?: string | number
  /** String label for the transaction type, e.g. "Order", "Fee", "Refund". */
  transaction_type?: string
  /** Platform-assigned transaction reference number. */
  transaction_number?: string | number
  /** Decimal amount string; positive = credit, negative = debit. */
  amount?: string | number
  /** Human-readable statement / description. */
  statement?: string
  /** "1" = paid, "0" = pending / unpaid. */
  paid_status?: string | number
  /** Associated order number. */
  order_no?: string | number
  /** Associated order item id. */
  order_item_no?: string | number
  /** Shipment type, e.g. "Dropshipping". */
  shipment_type?: string
  /** Carrier / logistics provider name. */
  shipment_provider?: string
  /** External payment or reference ID. */
  reference_id?: string | number
  [key: string]: unknown
}

export interface RawDarazTransactionEnvelope {
  data?: {
    transactions?: RawDarazTransaction[]
    count?: number
  }
  code?: string
  message?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Convert a Daraz transaction_type string to a canonical TransactionKind.
 */
function mapTransactionKind(type: string | undefined): TransactionKind | undefined {
  if (!type) return undefined
  switch (type.toLowerCase()) {
    case 'order':
    case 'item revenue':
      return 'SALE'
    case 'refund':
    case 'reversal':
      return 'REFUND'
    case 'fee':
    case 'adjustment':
    case 'logistics fee':
    case 'commission':
    case 'voucher':
      return 'CAPTURE'
    default:
      return undefined
  }
}

/**
 * Convert Daraz paid_status to canonical TransactionStatus.
 */
function mapTransactionStatus(paidStatus: string | number | undefined): TransactionStatus {
  if (paidStatus == null) return 'PENDING'
  const s = String(paidStatus)
  return s === '1' || s.toLowerCase() === 'paid' ? 'SUCCESS' : 'PENDING'
}

/**
 * Parse a Daraz date string into ISO 8601.
 * Daraz returns dates like "2024-03-15 10:30:00" (no T, no Z).
 * We normalise to ISO format.
 */
function toIso(val: string | number | undefined): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') {
    return new Date(val).toISOString()
  }
  // Replace space with T for ISO parsing
  const normalised = val.replace(' ', 'T')
  const d = new Date(normalised)
  return Number.isNaN(d.getTime()) ? val : d.toISOString()
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Map one Daraz finance transaction to the canonical Transaction shape.
 */
export function transformTransaction(raw: RawDarazTransaction, currency = 'USD'): Transaction {
  const rawAmount = parseNumber(raw.amount)
  const amountMinor = majorToMinor(Math.abs(rawAmount), currency)
  const processedAt = toIso(raw.transaction_date)

  return {
    id: String(raw.transaction_number ?? raw.reference_id ?? ''),
    orderId: raw.order_no ? String(raw.order_no) : undefined,
    kind: mapTransactionKind(raw.transaction_type),
    status: mapTransactionStatus(raw.paid_status),
    amount: {
      amount: amountMinor ?? 0,
      currency,
    },
    gateway: raw.shipment_provider ?? undefined,
    authorizationCode: raw.reference_id ? String(raw.reference_id) : undefined,
    processedAt,
    createdAt: processedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
