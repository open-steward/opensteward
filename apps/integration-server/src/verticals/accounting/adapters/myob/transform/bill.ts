import type { Bill, BillStatus } from '../../../schema/bill'

export interface MyobBill {
  UID?: string
  Number?: string
  Supplier?: { UID?: string; Name?: string }
  Date?: string
  Terms?: { DueDate?: string }
  TotalAmount?: number
  TotalTax?: number
  BalanceDueAmount?: number
  Status?: string
  IsTaxInclusive?: boolean
  [key: string]: unknown
}

function mapStatus(status: string | undefined): BillStatus {
  switch (status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'AUTHORIZED'
  }
}

export function transformBill(raw: MyobBill): Bill {
  return {
    id: raw.UID || undefined,
    billNumber: raw.Number || undefined,
    contactId: raw.Supplier?.UID || undefined,
    status: mapStatus(raw.Status),
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TotalTax,
    balanceAmount: raw.BalanceDueAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.Terms?.DueDate ? new Date(raw.Terms.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
