import type { Bill, BillStatus } from '../../../schema/bill'

export interface PowerOfficeBill {
  id: number
  supplierId: number
  invoiceDate: string
  dueDate: string
  currencyCode: string
  grossAmount: number
  netAmount: number
  vatAmount: number
  isPaid: boolean
  isVoid: boolean
  status: number
  [key: string]: unknown
}

function mapStatus(raw: PowerOfficeBill): BillStatus {
  if (raw.isVoid) return 'VOIDED'
  if (raw.isPaid) return 'PAID'
  if (raw.status === 5) return 'AUTHORIZED'
  if (raw.status === 0) return 'DRAFT'
  return 'AUTHORIZED'
}

export function transformBill(raw: PowerOfficeBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
