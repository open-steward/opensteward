import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FenbeitongBillLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface FenbeitongBill {
  billId?: string
  billNo?: string
  billDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  status?: string
  supplierId?: string
  currency?: string
  lines?: FenbeitongBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): BillStatus {
  switch (s) {
    case 'paid': return 'PAID'
    case 'approved': return 'AUTHORIZED'
    case 'rejected': return 'VOIDED'
    case 'pending': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: FenbeitongBill): Bill {
  return {
    id: raw.billId ? String(raw.billId) : undefined,
    status: mapStatus(raw.status),
    billNumber: raw.billNo || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
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
