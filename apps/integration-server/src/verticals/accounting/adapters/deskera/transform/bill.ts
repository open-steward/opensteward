import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { DeskeraDocumentItem } from './invoice'

export interface DeskeraBill {
  id: string
  documentSequenceCode?: string
  documentDate?: string
  validTillDate?: string
  totalAmount?: number
  taxAmount?: number
  dueAmount?: number
  subTotal?: number
  currency?: string
  contactCode?: string
  contactName?: string
  status?: string
  documentItems?: DeskeraDocumentItem[]
  memo?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'DRAFT':
      return 'DRAFT'
    case 'OPEN':
      return 'AUTHORIZED'
    case 'PARTIAL':
      return 'PARTIALLY_PAID'
    case 'PAID':
      return 'PAID'
    case 'VOID':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: DeskeraDocumentItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.accountCode || undefined,
    itemDescription: item.description || item.name || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.totalAmount ?? 0,
    taxAmount: item.taxAmount || undefined,
    discountAmount: item.discountAmount || undefined,
  }
}

export function transformBill(raw: DeskeraBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.documentSequenceCode || raw.id,
    contactId: raw.contactCode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount ?? 0,
    taxAmount: raw.taxAmount ?? 0,
    balanceAmount: raw.dueAmount,
    notes: raw.memo || undefined,
    lineItems: (raw.documentItems ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.validTillDate ? new Date(raw.validTillDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
