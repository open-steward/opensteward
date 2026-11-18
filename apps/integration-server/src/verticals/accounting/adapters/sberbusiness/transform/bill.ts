import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface SberbusinessBillLine {
  lineId?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface SberbusinessBill {
  billId?: string
  billNumber?: string
  billDate?: string
  dueDate?: string
  totalAmount?: number
  vatAmount?: number
  status?: string
  supplierId?: string
  currencyCode?: string
  lines?: SberbusinessBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): BillStatus {
  switch (s) {
    case 'PAID': return 'PAID'
    case 'CREATED': return 'AUTHORIZED'
    case 'SENT': return 'AUTHORIZED'
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: SberbusinessBill): Bill {
  return {
    id: raw.billId ? String(raw.billId) : undefined,
    status: mapStatus(raw.status),
    billNumber: raw.billNumber || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.lineId ? String(l.lineId) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
