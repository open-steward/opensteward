import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface EpsilonNetBillLine {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  totalNetValue: number
  vatAmount: number
  accountCode: string
  discount: number
  [key: string]: unknown
}

export interface EpsilonNetBill {
  id: string | number
  invoiceNumber: string
  invoiceType: string
  status: string
  issueDate: string
  dueDate: string
  totalNetValue: number
  totalVatAmount: number
  totalGrossValue: number
  currency: string
  counterpart: {
    vatNumber: string
    [key: string]: unknown
  }
  lines: EpsilonNetBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Submitted':
      return 'AUTHORIZED'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: EpsilonNetBillLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.totalNetValue,
    taxAmount: line.vatAmount || undefined,
    discountAmount: line.discount || undefined,
  }
}

export function transformBill(raw: EpsilonNetBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.counterpart?.vatNumber || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGrossValue,
    taxAmount: raw.totalVatAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
