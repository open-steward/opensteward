/**
 * Fakturownia ↔ canonical Bill transform.
 *
 * Fakturownia expense invoices (income=0 or kind=expense) are mapped to
 * canonical Bill objects.  They share the same API schema as income invoices.
 *
 * Money: Fakturownia returns amounts in major currency units (e.g. 12.34 PLN).
 * Canonical Amount fields are integer minor units (e.g. 1234 = 12.34 PLN).
 * All monetary values are converted with toMinorUnits().
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { FakturowniaInvoice, FakturowniaPosition } from './invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Money helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a Fakturownia major-unit amount (e.g. 12.34) to canonical integer
 * minor units (e.g. 1234 cents).  Returns `undefined` for absent/NaN inputs.
 */
function toMinorUnits(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: FakturowniaInvoice): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'rejected') return 'VOIDED'
  if (s === 'sent' || s === 'issued') return 'AUTHORIZED'
  return 'DRAFT'
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapPosition(pos: FakturowniaPosition): Lineitem {
  const qty = pos.quantity != null ? Number(pos.quantity) : undefined
  const totalGrossMinor = toMinorUnits(pos.total_price_gross)
  const totalNetMinor = toMinorUnits(pos.total_price_net)
  const taxMinor =
    totalGrossMinor != null && totalNetMinor != null
      ? totalGrossMinor - totalNetMinor
      : undefined

  return {
    id: pos.id != null ? String(pos.id) : undefined,
    itemId: pos.product_id != null ? String(pos.product_id) : undefined,
    itemDescription: pos.name || undefined,
    unitAmount: toMinorUnits(pos.price_net),
    unitQuantity: qty != null ? Math.round(qty) : undefined,
    totalAmount: totalGrossMinor,
    taxAmount: taxMinor != null && !isNaN(taxMinor) ? taxMinor : undefined,
    notes: pos.description || undefined,
  }
}

// ── Forward transform ─────────────────────────────────────────────────────────

export function transformBill(raw: FakturowniaInvoice): Bill {
  const totalMinor = toMinorUnits(raw.price_gross)
  const taxMinor = toMinorUnits(raw.price_tax)
  const paidMinor = toMinorUnits(raw.paid)
  const balanceMinor =
    totalMinor != null && paidMinor != null ? totalMinor - paidMinor : undefined

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: totalMinor,
    taxAmount: taxMinor,
    paidAmount: paidMinor,
    balanceAmount: balanceMinor,
    notes: raw.description || undefined,
    lineItems: Array.isArray(raw.positions) && raw.positions.length > 0
      ? raw.positions.map(mapPosition)
      : undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_to ? new Date(raw.payment_to) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
