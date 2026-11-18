/**
 * Foxy.io Payment → canonical Transaction.
 *
 * In Foxy, payment records are embedded in transactions (orders) via
 * `zoom=payments`. There is no standalone payments list endpoint; callers
 * access payments via the transaction they belong to.
 *
 * Foxy payment fields are minimal — the gateway name and amount are the
 * most useful. There is no explicit "kind" field; Foxy payments are always
 * captures (SALE) in the canonical sense.
 *
 * Docs: https://api.foxycart.com/rels/transaction (fx:payments embed)
 */

import type {
  Transaction,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFoxyPayment {
  id: number | string
  /** The Foxy transaction (order) this payment belongs to. */
  transaction_id?: number | string | null
  /** Payment gateway name, e.g. "stripe". */
  gateway_type?: string | null
  /** Authorization code returned by the gateway. */
  cc_number_masked?: string | null
  /** Payment amount (decimal major units). */
  amount?: number | string | null
  /** Currency code, e.g. "USD". */
  currency_code?: string | null
  /** Foxy payment status: approved | declined | pending | error */
  status?: string | null
  date_created?: string | null
  date_modified?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, TransactionStatus> = {
  approved: 'SUCCESS',
  declined: 'FAILURE',
  pending: 'PENDING',
  error: 'ERROR',
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawFoxyPayment): Transaction {
  const currency = raw.currency_code ?? 'USD'
  return {
    id: String(raw.id),
    orderId: raw.transaction_id != null ? String(raw.transaction_id) : undefined,
    // Foxy payments are always captures (there is no separate auth step exposed here).
    kind: 'SALE',
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    amount:
      raw.amount != null
        ? { amount: majorToMinor(toNum(raw.amount), currency), currency }
        : undefined,
    gateway: raw.gateway_type ?? undefined,
    createdAt: raw.date_created ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
