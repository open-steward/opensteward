import type { Bill, BillStatus } from '../../../schema/bill'

export interface UnimicroBill {
  ID?: number
  SupplierID?: number
  BillNumber?: string
  InvoiceDate?: string
  PaymentDueDate?: string
  TaxExclusiveAmount?: number
  TaxAmount?: number
  TaxInclusiveAmount?: number
  RestAmount?: number
  StatusCode?: number
  [key: string]: unknown
}

function mapStatus(statusCode?: number): BillStatus {
  switch (statusCode) {
    case 10:
      return 'DRAFT'
    case 20:
      return 'AUTHORIZED'
    case 40:
      return 'PAID'
    case 30:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: UnimicroBill): Bill {
  return {
    id: String(raw.ID ?? ''),
    status: mapStatus(raw.StatusCode),
    billNumber: raw.BillNumber || undefined,
    contactId: raw.SupplierID !== undefined ? String(raw.SupplierID) : undefined,
    totalAmount: raw.TaxInclusiveAmount,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.RestAmount,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.PaymentDueDate ? new Date(raw.PaymentDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
