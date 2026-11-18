/**
 * Reckon One v2 bill (supplier purchase) transforms.
 *
 * API endpoint: GET/POST/PUT /R1/{cashbookId}/bills[/{billId}]
 *
 * Key fields: id, billNumber, supplier.id, date, dueDate, totalAmount,
 *             amountOwing, currency, status, lines[]
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonOneBillLine {
  id?: string
  accountId?: string
  itemId?: string
  description?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  [key: string]: unknown
}

export interface ReckonOneBill {
  id: string
  billNumber?: string
  supplier?: { id: string; name?: string }
  date?: string
  dueDate?: string
  totalAmount?: number
  amountOwing?: number
  currency?: string
  status?: string
  notes?: string
  lines?: ReckonOneBillLine[]
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

function mapStatus(raw: ReckonOneBill): BillStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'PAID' || raw.amountOwing === 0) return 'PAID'
  if (s === 'DRAFT') return 'DRAFT'
  if (s === 'VOID' || s === 'VOIDED') return 'VOIDED'
  if (s === 'DELETED') return 'DELETED'

  const owing = raw.amountOwing ?? 0
  const total = raw.totalAmount ?? 0
  if (owing > 0 && owing < total) return 'PARTIALLY_PAID'
  if (raw.dueDate && new Date(raw.dueDate).getTime() < Date.now() && owing > 0) return 'OVERDUE'
  return 'AUTHORIZED'
}

function toMinorUnits(value: number | undefined | null): number | undefined {
  return value != null ? Math.round(value * 100) : undefined
}

function mapLines(lines: ReckonOneBillLine[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    accountId: l.accountId || undefined,
    itemId: l.itemId || undefined,
    itemDescription: l.description || undefined,
    unitAmount: toMinorUnits(l.unitPrice),
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: toMinorUnits(l.amount),
    taxAmount: toMinorUnits(l.taxAmount),
  }))
}

export function transformBill(raw: ReckonOneBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.billNumber || undefined,
    contactId: raw.supplier?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.totalAmount),
    balanceAmount: toMinorUnits(raw.amountOwing),
    paidAmount:
      raw.totalAmount != null && raw.amountOwing != null
        ? Math.round((raw.totalAmount - raw.amountOwing) * 100)
        : undefined,
    notes: raw.notes || undefined,
    lineItems: mapLines(raw.lines ?? []),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
