import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface BCPurchaseInvoiceLine {
  id: string
  description: string
  quantity: number
  directUnitCost: number
  taxAmount: number
  totalAmountExcludingTax: number
  totalAmountIncludingTax: number
  [key: string]: unknown
}

export interface BCBill {
  id: string
  number: string
  vendorId: string
  vendorNumber: string
  vendorName: string
  payToVendorId?: string
  payToName?: string
  invoiceDate?: string
  postingDate?: string
  dueDate?: string
  currencyCode?: string
  totalAmountExcludingTax?: number
  totalTaxAmount?: number
  totalAmountIncludingTax: number
  status: 'Draft' | 'In Review' | 'Open' | 'Paid' | 'Canceled'
  purchaseInvoiceLines?: BCPurchaseInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: BCBill['status']): BillStatus {
  switch (status) {
    case 'Draft':
    case 'In Review':
      return 'DRAFT'
    case 'Open':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Canceled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BCPurchaseInvoiceLine): Lineitem {
  return {
    id: line.id,
    itemDescription: line.description || undefined,
    unitAmount: line.directUnitCost,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmountIncludingTax,
  }
}

export function transformBill(raw: BCBill): Bill {
  return {
    id: raw.id,
    billNumber: raw.number || undefined,
    contactId: raw.vendorId || undefined,
    currency: raw.currencyCode || undefined,
    status: mapStatus(raw.status),
    totalAmount: raw.totalAmountIncludingTax,
    taxAmount: raw.totalTaxAmount,
    lineItems: (raw.purchaseInvoiceLines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
