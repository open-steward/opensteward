import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ChanjetBillLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface ChanjetBill {
  billId?: string
  billNo?: string
  billDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  invoiceStatus?: number | string
  supplierId?: string
  currencyCode?: string
  lines?: ChanjetBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): BillStatus {
  switch (String(s)) {
    case '2': return 'PAID'
    case '1': return 'AUTHORIZED'
    case '3': return 'VOIDED'
    case '0': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: ChanjetBill): Bill {
  return {
    id: raw.billId ? String(raw.billId) : undefined,
    status: mapStatus(raw.invoiceStatus),
    billNumber: raw.billNo || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
