/**
 * Bagisto Invoice / Transaction → canonical Transaction.
 *
 * Bagisto's payment transactions live under `/api/v1/orders/{orderId}/invoices`.
 * Invoices represent fulfilled payment captures. The Bagisto REST API v1 also
 * exposes a global `/api/v1/invoices` endpoint.
 *
 * Amounts are decimal strings in major units (e.g. "59.98").
 *
 * Docs: https://devdocs.bagisto.com/1.x/api/invoices.html
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface BagistoInvoice {
  id: number | string
  order_id?: number | string | null
  state?: string | null // paid | pending | fraud | cancelled
  grand_total?: string | number | null
  base_grand_total?: string | number | null
  currency_code?: string | null
  transaction_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'number' ? v : parseFloat(String(v))
}

function mapStatus(state: string | null | undefined): TransactionStatus | undefined {
  switch ((state ?? '').toLowerCase()) {
    case 'paid':
    case 'completed':
      return 'SUCCESS'
    case 'pending':
      return 'PENDING'
    case 'fraud':
    case 'cancelled':
    case 'canceled':
    case 'failed':
      return 'FAILURE'
    default:
      return undefined
  }
}

export function transformTransaction(raw: BagistoInvoice): Transaction {
  const currency = raw.currency_code ?? 'USD'
  const total = toNum(raw.grand_total ?? raw.base_grand_total)

  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: 'SALE',
    status: mapStatus(raw.state),
    amount: total > 0 ? { amount: majorToMinor(total, currency), currency } : undefined,
    gateway: 'bagisto',
    processedAt: raw.created_at ?? undefined,
    createdAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
