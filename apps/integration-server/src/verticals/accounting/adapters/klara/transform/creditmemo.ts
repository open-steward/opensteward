/**
 * KLARA credit note (Gutschrift) transform.
 *
 * KLARA credit notes reduce outstanding amounts on issued invoices.
 * Fields: id, credit_note_number, status, contact_id, currency,
 *         total_amount, balance_amount, credit_date, notes, positions[]
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraCreditNotePosition {
  id?: string
  article_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate_id?: string
  account_id?: string
  [key: string]: unknown
}

export interface KlaraCreditNote {
  id: string
  credit_note_number?: string
  status?: string
  contact_id?: string
  currency?: string
  total_amount?: number
  balance_amount?: number
  paid_amount?: number
  credit_date?: string
  notes?: string
  created_at?: string
  updated_at?: string
  positions?: KlaraCreditNotePosition[]
  [key: string]: unknown
}

function mapStatus(raw: KlaraCreditNote): CreditMemoStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'issued':
    case 'open': return 'AUTHORIZED'
    case 'applied':
    case 'paid': return 'PAID'
    case 'partial':
    case 'partially_applied': return 'PARTIALLY_PAID'
    case 'voided':
    case 'cancelled': return 'VOIDED'
    default: {
      const balance = raw.balance_amount ?? 0
      const total = raw.total_amount ?? 0
      if (balance === 0 && total > 0) return 'PAID'
      if (balance > 0 && balance < total) return 'PARTIALLY_PAID'
      return 'AUTHORIZED'
    }
  }
}

function mapPositions(positions: KlaraCreditNotePosition[]): Lineitem[] {
  return positions.map((p) => ({
    id: p.id || undefined,
    accountId: p.account_id || undefined,
    itemId: p.article_id || undefined,
    itemDescription: p.description || undefined,
    unitAmount: p.unit_price,
    unitQuantity: p.quantity != null ? Math.round(p.quantity) : undefined,
    totalAmount: p.total_price,
    taxrateId: p.tax_rate_id || undefined,
  }))
}

export function transformCreditMemo(raw: KlaraCreditNote): CreditMemo {
  return {
    id: raw.id || undefined,
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    balanceAmount: raw.balance_amount,
    paidAmount: raw.paid_amount,
    notes: raw.notes || undefined,
    lineItems: (raw.positions ?? []).length > 0 ? mapPositions(raw.positions ?? []) : undefined,
    postedAt: raw.credit_date ? new Date(raw.credit_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
