import type { Bill, BillStatus } from '../../../schema/bill'

export interface BluenextBill {
  id: string
  documentNumber: string
  documentDate: string
  expiryDate: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  openAmount: number
  documentStatus: string
  currency: string
  supplierId: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'confirmed': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: BluenextBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    billNumber: raw.documentNumber || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openAmount,
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.expiryDate ? new Date(raw.expiryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
