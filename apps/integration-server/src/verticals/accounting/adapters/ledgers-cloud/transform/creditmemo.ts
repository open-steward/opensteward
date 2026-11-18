/**
 * LEDGERS.Cloud credit note transform.
 *
 * Endpoints:
 *   GET    /v3/credit-note/{id}    — view single
 *   GET    /v3/view-credit-note    — view (alternate path)
 *   DELETE /v3/delete-credit-note  — delete
 *
 * Wire fields: id, credit_note_number, credit_date, contact.id / contact_id,
 *   currency, total_amount, balance_amount, paid_amount, notes, items[]
 *
 * LEDGERS credit notes map to LEDGERS.Cloud's POST /add-invoice with
 * type "credit_note"; the list endpoint is /v3/list-invoice?type=credit_note.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface LedgersCreditNoteItem {
  id?: string | number
  item_id?: string | number
  name?: string
  description?: string
  unit_price?: number
  quantity?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface LedgersCreditNote {
  id?: string | number
  credit_note_number?: string
  document_number?: string
  credit_date?: string
  created_at?: string
  updated_at?: string
  contact?: { id?: string | number; contact_id?: string | number }
  contact_id?: string | number
  currency?: string
  payment_status?: string       // "Paid" | "Part Paid" | "Not Paid"
  total_amount?: number
  paid_amount?: number
  balance_amount?: number
  tax_amount?: number
  notes?: string
  items?: LedgersCreditNoteItem[]
  [key: string]: unknown
}

function mapStatus(raw: LedgersCreditNote): CreditMemoStatus {
  const ps = (raw.payment_status ?? '').toLowerCase()
  if (ps === 'paid') return 'PAID'
  if (ps === 'part paid' || ps === 'partially paid') return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLines(items: LedgersCreditNoteItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    id: it.id != null ? String(it.id) : undefined,
    itemId: it.item_id != null ? String(it.item_id) : undefined,
    itemName: it.name || undefined,
    itemDescription: it.description || undefined,
    unitAmount: it.unit_price,
    unitQuantity: it.quantity != null ? Math.round(it.quantity) : undefined,
    taxAmount: it.tax_amount,
    totalAmount: it.amount,
  }))
}

export function transformCreditMemo(raw: LedgersCreditNote): CreditMemo {
  const contactId =
    raw.contact?.id ??
    raw.contact?.contact_id ??
    raw.contact_id
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_note_number || raw.document_number || undefined,
    contactId: contactId != null ? String(contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount,
    balanceAmount: raw.balance_amount,
    notes: raw.notes || undefined,
    lineItems: raw.items ? mapLines(raw.items) : undefined,
    postedAt: raw.credit_date ? new Date(raw.credit_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
