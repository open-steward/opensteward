/**
 * VosFactures → canonical Transaction transform.
 *
 * VosFactures exposes payment records via GET /banking/payments.json.
 * Each payment records a monetary settlement linked to one or more invoices.
 *
 * Key fields: id, name, paid (amount), paid_date, invoice_id, currency, kind,
 * price, client_id, provider, description, comment.
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { Transaction } from '../../../schema/transaction'
import { parseDecimal } from '../../shared/transform'

// ── VosFactures raw payment shape ─────────────────────────────────────────

export interface VosFacturesPayment {
  id: number
  name?: string
  paid?: string | number          // amount paid (decimal string)
  price?: string | number         // alias for paid amount
  paid_date?: string              // YYYY-MM-DD
  invoice_id?: number
  currency?: string
  kind?: string                   // payment method / type (e.g. "transfer", "card", "api")
  client_id?: number
  provider?: string
  description?: string
  comment?: string
  department_id?: number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mapType(raw: VosFacturesPayment): string {
  if (raw.kind) return raw.kind.toUpperCase()
  return 'PAYMENT'
}

// ── Public transform ──────────────────────────────────────────────────────

export function transformTransaction(raw: VosFacturesPayment): Transaction {
  const totalAmount = parseDecimal(raw.paid) ?? parseDecimal(raw.price)

  return {
    id: String(raw.id),
    type: mapType(raw),
    reference: raw.invoice_id !== undefined ? String(raw.invoice_id) : undefined,
    memo: raw.description || raw.comment || undefined,
    paymentMethod: raw.kind || undefined,
    currency: raw.currency || undefined,
    totalAmount,
    contacts:
      raw.client_id !== undefined
        ? [{ id: String(raw.client_id), name: raw.name || undefined }]
        : undefined,
    createdAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
