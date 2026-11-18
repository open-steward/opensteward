/**
 * Fakturownia ↔ canonical Transaction transform.
 *
 * Fakturownia exposes payment records via the /payments.json endpoint
 * (banking_payment objects).  These are payment events that can be linked
 * to one or more invoices.  We map them to canonical Transaction objects.
 *
 * Key Fakturownia payment fields (banking_payment):
 *   id, name, price, kind, paid, invoice_id, invoice_ids, currency, paid_date
 *
 * Money: Fakturownia returns amounts in major currency units (e.g. 12.34 PLN).
 * Canonical Amount fields are integer minor units (e.g. 1234 = 12.34 PLN).
 * All monetary values are converted with toMinorUnits().
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { Transaction } from '../../../schema/transaction'

// ── Raw Fakturownia type ──────────────────────────────────────────────────────

export interface FakturowniaPayment {
  id: number | string
  name?: string
  price?: number | string
  kind?: string
  paid?: boolean | string
  invoice_id?: number | string | null
  invoice_ids?: (number | string)[]
  currency?: string
  paid_date?: string
  [key: string]: unknown
}

// ── Money helpers ─────────────────────────────────────────────────────────────

function toMinorUnits(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

// ── Forward transform ─────────────────────────────────────────────────────────

export function transformTransaction(raw: FakturowniaPayment): Transaction {
  return {
    id: String(raw.id),
    type: raw.kind || undefined,
    reference:
      raw.invoice_id != null
        ? String(raw.invoice_id)
        : Array.isArray(raw.invoice_ids) && raw.invoice_ids.length > 0
          ? String(raw.invoice_ids[0])
          : undefined,
    memo: raw.name || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.price),
    createdAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
