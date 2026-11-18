import type { Bill, BillStatus } from '../../../schema/bill'

export interface BlBill {
  Id: string
  BillNumber: number
  SupplierId: string
  Currency: string
  BillDate: string
  DueDate: string
  TotalAmount: number
  VatAmount: number
  RemainingAmount: number
  PaidAmount: number
  Status: string
  [key: string]: unknown
}

function mapStatus(raw: BlBill): BillStatus {
  switch (raw.Status) {
    case 'Paid':
      return 'PAID'
    case 'PartiallyPaid':
      return 'PARTIALLY_PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Approved':
      return 'AUTHORIZED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: BlBill): Bill {
  return {
    id: raw.Id,
    status: mapStatus(raw),
    billNumber: raw.BillNumber ? String(raw.BillNumber) : undefined,
    contactId: raw.SupplierId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    balanceAmount: raw.RemainingAmount,
    paidAmount: raw.PaidAmount,
    postedAt: raw.BillDate ? new Date(raw.BillDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
