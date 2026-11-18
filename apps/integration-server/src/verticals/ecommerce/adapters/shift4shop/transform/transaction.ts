/**
 * Shift4Shop OrderTransaction → canonical Transaction.
 *
 * Transactions live under `/Orders/{orderId}/Transactions` in the
 * Shift4Shop REST API. Each record captures a payment action
 * (authorization, capture, refund, void) and the gateway response.
 *
 * Docs: https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/Transactions
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopTransaction {
  OrderTransactionID?: number | string | null
  InvoiceNumber?: number | string | null
  /** e.g. "Sale", "Auth", "Capture", "Refund", "Void", "Credit" */
  TransactionType?: string | null
  /** e.g. "Approved", "Declined", "Error" */
  TransactionResponse?: string | null
  Amount?: number | string | null
  CurrencyCode?: string | null
  PaymentMethod?: string | null
  AuthorizationCode?: string | null
  TransactionDate?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? 0 : n
}

function mapKind(type: string | null | undefined): TransactionKind | undefined {
  const t = (type ?? '').toLowerCase()
  if (t === 'auth' || t === 'authorization') return 'AUTHORIZATION'
  if (t === 'capture') return 'CAPTURE'
  if (t === 'sale') return 'SALE'
  if (t === 'refund' || t === 'credit') return 'REFUND'
  if (t === 'void') return 'VOID'
  return undefined
}

function mapStatus(response: string | null | undefined): TransactionStatus | undefined {
  const r = (response ?? '').toLowerCase()
  if (r === 'approved' || r === 'success') return 'SUCCESS'
  if (r === 'declined' || r === 'failed' || r === 'failure') return 'FAILURE'
  if (r === 'error') return 'ERROR'
  if (r === 'pending') return 'PENDING'
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(
  raw: RawShift4ShopTransaction,
  orderId?: string,
): Transaction {
  const currency = raw.CurrencyCode ?? 'USD'
  const amount = toNum(raw.Amount)

  return {
    id: String(raw.OrderTransactionID ?? ''),
    orderId: orderId ?? (raw.InvoiceNumber != null ? String(raw.InvoiceNumber) : undefined),
    kind: mapKind(raw.TransactionType),
    status: mapStatus(raw.TransactionResponse),
    amount: amount > 0 ? { amount: majorToMinor(amount, currency), currency } : undefined,
    gateway: raw.PaymentMethod ?? undefined,
    authorizationCode: raw.AuthorizationCode ?? undefined,
    processedAt: toIsoDatetime(raw.TransactionDate),
    createdAt: toIsoDatetime(raw.TransactionDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
