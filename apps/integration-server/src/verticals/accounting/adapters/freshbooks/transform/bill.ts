import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FreshBooksBillLine {
  lineid: number
  description: string
  unit_cost: { amount: string }
  quantity: string
  amount: { amount: string }
}

export interface FreshBooksBill {
  id: number
  vendor_id: number
  bill_number: string
  due_date: string
  issue_date: string
  currency_code: string
  amount: { amount: string; code: string }
  outstanding: { amount: string; code: string }
  paid: { amount: string; code: string }
  status: number
  lines: FreshBooksBillLine[]
  [key: string]: unknown
}

function mapStatus(status: number): BillStatus {
  switch (status) {
    case 1: return 'DRAFT'
    case 4: return 'AUTHORIZED'
    case 5: return 'OVERDUE'
    case 9: return 'PARTIALLY_PAID'
    case 12: return 'PAID'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FreshBooksBillLine): Lineitem {
  return {
    id: String(line.lineid),
    itemDescription: line.description || undefined,
    unitAmount: line.unit_cost?.amount ? parseFloat(line.unit_cost.amount) : undefined,
    unitQuantity: line.quantity ? parseFloat(line.quantity) : undefined,
    totalAmount: line.amount?.amount ? parseFloat(line.amount.amount) : undefined,
  }
}

export function transformBill(raw: FreshBooksBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.bill_number || undefined,
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    balanceAmount: raw.outstanding?.amount ? parseFloat(raw.outstanding.amount) : undefined,
    paidAmount: raw.paid?.amount ? parseFloat(raw.paid.amount) : undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
