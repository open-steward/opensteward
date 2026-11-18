import type { Bill, BillStatus } from '../../../schema/bill'

export interface AccurateBillLine {
  id: number
  itemNo: string
  itemName: string
  unitPrice: number
  quantity: number
  amount: number
  taxAmount: number
  [key: string]: unknown
}

export interface AccurateBill {
  id: number
  number: string
  status: string
  transactionDate: string
  dueDate: string
  totalAmount: number
  taxAmount: number
  currencyCode: string
  customerNo: string
  detailItem: AccurateBillLine[]
  [key: string]: unknown
}

function mapBillStatus(status: string): BillStatus {
  switch (status) {
    case 'Closed':
      return 'PAID'
    case 'Voided':
      return 'VOIDED'
    case 'Open':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: AccurateBill): Bill {
  return {
    id: String(raw.id),
    status: mapBillStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.customerNo || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    lineItems: (raw.detailItem ?? []).map((line) => ({
      id: String(line.id),
      itemId: line.itemNo || undefined,
      itemDescription: line.itemName || undefined,
      unitAmount: line.unitPrice,
      unitQuantity: line.quantity,
      totalAmount: line.amount,
      taxAmount: line.taxAmount,
    })),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
