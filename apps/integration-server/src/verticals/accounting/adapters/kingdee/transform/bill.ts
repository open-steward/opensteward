import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface KingdeeBillLine {
  id?: string
  description?: string
  price?: number
  qty?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface KingdeeBill {
  id?: string
  billId?: string
  billNo?: string
  billDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  vendorId?: string
  currId?: string
  status?: string
  lines?: KingdeeBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): BillStatus {
  switch (s) {
    case 'A': return 'AUTHORIZED'
    case 'B': return 'PAID'
    case 'C': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: KingdeeBill): Bill {
  return {
    id: raw.id ? String(raw.id) : raw.billId ? String(raw.billId) : undefined,
    status: mapStatus(raw.status),
    billNumber: raw.billNo || undefined,
    contactId: raw.vendorId ? String(raw.vendorId) : undefined,
    currency: raw.currId || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.qty,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
