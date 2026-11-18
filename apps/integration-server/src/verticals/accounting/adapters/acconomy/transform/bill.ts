import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AcconomyBillLine {
  id?: number | string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  tax?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface AcconomyBill {
  id: number | string
  bill_number?: string
  bill_date?: string
  due_date?: string
  subtotal?: number
  tax?: number
  total?: number
  balance?: number
  state?: string
  contact_id?: number | string
  currency?: string
  lines?: AcconomyBillLine[]
  [key: string]: unknown
}

function mapStatus(state?: string): BillStatus {
  switch (state?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcconomyBillLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.tax || undefined,
  }
}

export function transformBill(raw: AcconomyBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
