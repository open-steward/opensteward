/**
 * Big Cartel Order Transaction → canonical Transaction.
 *
 * Big Cartel does not expose a standalone /transactions endpoint. Transaction
 * data is embedded within order responses under `relationships.transactions`.
 * Each transaction has: id, label, amount, processor, processor_id,
 * processor_url, and a linked currency.
 *
 * This is a DERIVED resource — we extract transactions from order responses.
 * The caller is responsible for passing the order ID and currency alongside
 * the raw transaction object.
 *
 * Docs: https://developers.bigcartel.com/api/v1#orders (transactions relationship)
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Big Cartel shape ───────────────────────────────────────────────────

export interface RawBigCartelTransaction {
  id: string | number
  type?: string
  attributes?: {
    label?: string | null
    amount?: number | string | null
    processor?: string | null
    processor_id?: string | null
    processor_url?: string | null
    status?: string | null
    created_at?: string | null
  }
  /** Derived context injected by the adapter */
  _orderId?: string
  _currency?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'success':
    case 'completed':
      return 'SUCCESS'
    case 'failure':
    case 'failed':
      return 'FAILURE'
    case 'error':
      return 'ERROR'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(
  raw: RawBigCartelTransaction,
  orderId?: string,
  currency?: string,
): Transaction {
  const attrs = raw.attributes ?? {}
  const resolvedCurrency = currency ?? raw._currency ?? 'USD'
  const resolvedOrderId = orderId ?? raw._orderId

  const amount =
    attrs.amount != null
      ? {
          amount: majorToMinor(toNum(attrs.amount), resolvedCurrency),
          currency: resolvedCurrency,
        }
      : undefined

  return {
    id: String(raw.id),
    orderId: resolvedOrderId,
    // Big Cartel transactions are always sales (charges) from the buyer
    kind: 'SALE',
    status: mapStatus(attrs.status) ?? 'SUCCESS',
    amount,
    gateway: attrs.processor ?? undefined,
    authorizationCode: attrs.processor_id ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
