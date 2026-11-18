import type { Bill, BillStatus } from '../../../schema/bill'

export interface CegidBill {
  id: string
  documentNumber: string
  supplierId: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  openAmount: number
  currency: string
  documentDate: string
  dueDate: string
  documentStatus: string
  [key: string]: unknown
}

function mapStatus(documentStatus: string): BillStatus {
  switch (documentStatus) {
    case 'Posted': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: CegidBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    billNumber: raw.documentNumber || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.openAmount,
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
