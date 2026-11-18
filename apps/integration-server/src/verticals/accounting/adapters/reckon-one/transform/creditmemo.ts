/**
 * Reckon One Credit Notes → canonical CreditMemo.
 *
 * Endpoint: GET /R1/{cashbookId}/creditNotes[/{id}]
 *
 * Key fields:
 *   id, creditNoteNumber, customer.id, date, status, totalAmount,
 *   amountOwing, currency, lines[]
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonOneCreditNoteLine {
  id?: string
  description?: string
  accountId?: string
  itemId?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  taxCodeId?: string
  taxAmount?: number
  [key: string]: unknown
}

export interface ReckonOneCreditNote {
  id: string
  creditNoteNumber?: string
  customer?: { id: string; name?: string }
  /** ISO date string e.g. "2024-03-01" */
  date?: string
  dueDate?: string
  totalAmount?: number
  amountOwing?: number
  currency?: string
  status?: string
  notes?: string
  lines?: ReckonOneCreditNoteLine[]
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinorUnits(value: number | undefined | null): number | undefined {
  return value != null ? Math.round(value * 100) : undefined
}

function mapStatus(raw: ReckonOneCreditNote): CreditMemoStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'PAID') return 'PAID'
  if (s === 'DRAFT') return 'DRAFT'
  if (s === 'VOID' || s === 'VOIDED') return 'VOIDED'
  if (s === 'DELETED') return 'DELETED'
  const owing = raw.amountOwing ?? 0
  const total = raw.totalAmount ?? 0
  if (total > 0 && owing === 0) return 'PAID'
  if (owing > 0 && owing < total) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLine(l: ReckonOneCreditNoteLine): Lineitem {
  return {
    id: l.id || undefined,
    accountId: l.accountId || undefined,
    itemId: l.itemId || undefined,
    itemDescription: l.description || undefined,
    unitAmount: toMinorUnits(l.unitPrice),
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: toMinorUnits(l.amount),
    taxAmount: toMinorUnits(l.taxAmount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCreditMemo(raw: ReckonOneCreditNote): CreditMemo {
  const total = toMinorUnits(raw.totalAmount)
  const owing = toMinorUnits(raw.amountOwing)
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.customer?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: total,
    balanceAmount: owing,
    paidAmount:
      total != null && owing != null ? Math.max(0, total - owing) : undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
