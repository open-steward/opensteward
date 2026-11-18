import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FABillLine {
  id?: number | string
  stock_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface FABill {
  id: number | string
  reference?: string
  supp_reference?: string
  tran_date?: string
  due_date?: string
  supplier_id?: number | string
  curr_code?: string
  total?: number
  tax_total?: number
  balance?: number
  status?: number | string
  lines?: FABillLine[]
  [key: string]: unknown
}

function mapStatus(status?: number | string): BillStatus {
  const s = Number(status)
  switch (s) {
    case 0:
      return 'DRAFT'
    case 1:
      return 'SUBMITTED'
    case 2:
      return 'AUTHORIZED'
    case 3:
      return 'DELETED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: FABillLine): Lineitem {
  return {
    itemId: line.stock_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount ?? 0,
    taxAmount: line.tax_amount || undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
  }
}

export function transformBill(raw: FABill): Bill {
  return {
    id: String(raw.id),
    billNumber: raw.reference || raw.supp_reference || undefined,
    status: mapStatus(raw.status),
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    currency: raw.curr_code || undefined,
    totalAmount: raw.total ?? 0,
    taxAmount: raw.tax_total ?? 0,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.tran_date ? new Date(raw.tran_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
