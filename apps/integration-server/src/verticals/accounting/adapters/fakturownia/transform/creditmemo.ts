/**
 * Fakturownia ↔ canonical CreditMemo transform.
 *
 * Fakturownia represents credit notes as correction invoices:
 * invoices with `kind: "correction"`.  They share the same API schema as
 * regular invoices and are fetched from the same /invoices.json endpoint
 * with `kind=correction`.
 *
 * Money: Fakturownia returns amounts in major currency units (e.g. 12.34 PLN).
 * Canonical Amount fields are integer minor units (e.g. 1234 = 12.34 PLN).
 * All monetary values are converted with toMinorUnits().
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { FakturowniaInvoice, FakturowniaPosition } from './invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Money helpers ─────────────────────────────────────────────────────────────

function toMinorUnits(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: FakturowniaInvoice): CreditMemoStatus {
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

export function transformCreditMemo(raw: FakturowniaInvoice): CreditMemo {
  const totalMinor = toMinorUnits(raw.price_gross)
  const taxMinor = toMinorUnits(raw.price_tax)
  const paidMinor = toMinorUnits(raw.paid)
  const balanceMinor =
    totalMinor != null && paidMinor != null ? totalMinor - paidMinor : undefined

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: totalMinor,
    taxAmount: taxMinor,
    paidAmount: paidMinor,
    balanceAmount: balanceMinor,
    refundReason: (raw.correction_reason as string | undefined) || undefined,
    notes: raw.description || undefined,
    lineItems:
      Array.isArray(raw.positions) && raw.positions.length > 0
        ? raw.positions.map(mapPosition)
        : undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_to ? new Date(raw.payment_to) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
