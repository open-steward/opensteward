import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem, Attachment } from '../../../schema/shared'

// Payhawk expense of type "invoice" maps to a payable bill.
// The same PayhawkExpense shape is used; we import from expense.ts to avoid duplication.
import type { PayhawkExpense } from './expense'

/** Convert a Payhawk decimal float amount to integer minor units (cents). */
function toMinorUnits(value: number | undefined | null): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

function mapStatus(raw: PayhawkExpense): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'rejected' || s === 'deleted') return 'VOIDED'
  if (s === 'approved') return 'AUTHORIZED'
  if (s === 'reviewed') return 'SUBMITTED'
  return 'DRAFT'
}

function mapLineitems(raw: PayhawkExpense): Lineitem[] {
  if (!raw.lines || raw.lines.length === 0) return []
  return raw.lines.map((line) => ({
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    itemDescription: line.categoryName || undefined,
    taxAmount: toMinorUnits(line.taxAmount),
    totalAmount: toMinorUnits(line.amount),
    taxrateId: line.taxRate?.id || undefined,
  }))
}

function mapAttachments(raw: PayhawkExpense): Attachment[] {
  if (!raw.documents || raw.documents.length === 0) return []
  return raw.documents.map((doc) => ({
    id: doc.id || undefined,
    url: doc.url || undefined,
    mimeType: doc.mimeType || undefined,
    fileName: doc.fileName || undefined,
  }))
}

export function transformBill(raw: PayhawkExpense): Bill {
  const lineItems = mapLineitems(raw)
  const attachments = mapAttachments(raw)
  const rawTotal = raw.totalAmount ?? raw.amount
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.reconciliationId || undefined,
    contactId: raw.supplier?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(rawTotal),
    taxAmount: toMinorUnits(raw.taxAmount),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
