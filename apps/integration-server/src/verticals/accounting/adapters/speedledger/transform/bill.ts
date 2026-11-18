import type { Bill, BillStatus } from '../../../schema/bill'

export interface SpeedLedgerBill {
  id: number | string
  billNumber?: string
  contactId?: number | string
  invoiceDate?: string
  dueDate?: string
  currency?: string
  totalInclVat?: number
  totalVat?: number
  balance?: number
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: SpeedLedgerBill): BillStatus {
  switch (raw.status?.toUpperCase()) {
    case 'PAID':
      return 'PAID'
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID'
    case 'SENT':
    case 'AUTHORIZED':
      return 'AUTHORIZED'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: SpeedLedgerBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.billNumber || undefined,
    contactId: raw.contactId !== undefined ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalInclVat,
    taxAmount: raw.totalVat,
    balanceAmount: raw.balance,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
