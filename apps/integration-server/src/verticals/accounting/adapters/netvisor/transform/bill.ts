import type { Bill, BillStatus } from '../../../schema/bill'

export interface NetvisorBill {
  NetvisorKey: number
  BillNumber: number
  VendorIdentifier: string
  Currency: string
  BillDate: string
  DueDate: string
  Amount: number
  VatAmount: number
  OpenAmount: number
  PaidAmount: number
  Status: string
  [key: string]: unknown
}

function mapStatus(raw: NetvisorBill): BillStatus {
  switch (raw.Status) {
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Approved':
      return 'AUTHORIZED'
    case 'Open':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: NetvisorBill): Bill {
  return {
    id: String(raw.NetvisorKey),
    status: mapStatus(raw),
    billNumber: raw.BillNumber ? String(raw.BillNumber) : undefined,
    contactId: raw.VendorIdentifier || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.VatAmount,
    balanceAmount: raw.OpenAmount,
    paidAmount: raw.PaidAmount || undefined,
    postedAt: raw.BillDate ? new Date(raw.BillDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
