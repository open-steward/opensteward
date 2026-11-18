import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface MazeedOneBillLine {
  id: string | number
  description: string
  qty: number
  unit_price: number
  total: number
  vat_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface MazeedOneBill {
  id: string | number
  bill_no: string
  bill_date: string
  due_date: string
  subtotal: number
  vat_amount: number
  total: number
  outstanding: number
  state: string
  supplier_id: string | number
  currency: string
  lines: MazeedOneBillLine[]
  [key: string]: unknown
}

function mapStatus(state: string): BillStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MazeedOneBillLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformBill(raw: MazeedOneBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    billNumber: raw.bill_no || undefined,
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
