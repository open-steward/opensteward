/**
 * LedgerSMB bill (vendor invoice) transform.
 *
 * LedgerSMB uses the same /invoices endpoint for both customer invoices and
 * vendor bills — the `type` field distinguishes them ('customer' | 'vendor').
 * Bills are fetched by posting with type='vendor' or by inspecting the invoice
 * type field.
 *
 * Response shape: see transform/invoice.ts (LedgerSMBInvoice interface).
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { LedgerSMBInvoice, LedgerSMBInvoiceLine } from './invoice'

function mapWorkflowStatusToBill(state: string | undefined): BillStatus {
  if (!state) return 'DRAFT'
  const s = state.toUpperCase()
  if (s === 'VOIDED' || s === 'REVERSED') return 'VOIDED'
  if (s === 'DELETED') return 'VOIDED'
  if (s === 'POSTED') return 'AUTHORIZED'
  if (s === 'ONHOLD') return 'AUTHORIZED'
  if (s === 'SAVED') return 'DRAFT'
  if (s === 'INITIAL') return 'DRAFT'
  return 'DRAFT'
}

/** Convert a decimal monetary value from LedgerSMB to integer minor units (cents). */
function toMinor(v: number | undefined | null): number | undefined {
  if (v == null) return undefined
  return Math.round(v * 100)
}

function mapLineitem(line: LedgerSMBInvoiceLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    itemId: line.part?.number || undefined,
    itemName: line.part?.description || undefined,
    itemDescription: line.description || undefined,
    unitAmount: toMinor(line.price),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    totalAmount: toMinor(line.total),
    discountAmount: toMinor(line.discount),
  }
}

export function transformBill(raw: LedgerSMBInvoice): Bill {
  const status = mapWorkflowStatusToBill(raw.workflow?.state)

  let taxAmount: number | undefined
  if (raw.taxes && Object.keys(raw.taxes).length > 0) {
    taxAmount = Math.round(
      Object.values(raw.taxes).reduce((sum, t) => sum + (t.amount ?? 0), 0) * 100,
    )
  } else if (raw.taxes_total != null) {
    taxAmount = toMinor(raw.taxes_total)
  }

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status,
    billNumber: raw['invoice-number'] || undefined,
    contactId: raw.eca?.id != null ? String(raw.eca.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinor(raw.total ?? raw.amount_tc),
    taxAmount: taxAmount ?? undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.dates?.book ? new Date(raw.dates.book) : undefined,
    dueAt: raw.dates?.due ? new Date(raw.dates.due) : undefined,
    createdAt: raw.dates?.created ? new Date(raw.dates.created) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
