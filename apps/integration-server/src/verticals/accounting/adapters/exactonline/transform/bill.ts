import type { Bill, BillStatus } from '../../../schema/bill'

export interface ExactBill {
  EntryID?: string
  InvoiceNumber?: string
  Supplier?: string
  SupplierName?: string
  AmountDC?: number
  VATAmountDC?: number
  AmountDCOpen?: number
  Currency?: string
  Status?: number
  EntryDate?: string
  DueDate?: string
  [key: string]: unknown
}

function mapStatus(status: number | undefined): BillStatus {
  switch (status) {
    case 10:
      return 'DRAFT'
    case 20:
      return 'AUTHORIZED'
    case 50:
      return 'PAID'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: ExactBill): Bill {
  return {
    id: raw.EntryID || undefined,
    billNumber: raw.InvoiceNumber || undefined,
    contactId: raw.Supplier || undefined,
    status: mapStatus(raw.Status),
    totalAmount: raw.AmountDC,
    taxAmount: raw.VATAmountDC,
    balanceAmount: raw.AmountDCOpen,
    currency: raw.Currency || undefined,
    postedAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
