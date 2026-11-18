import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface PEAccountingBillLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface PEAccountingBill {
  id: number | string
  bill_number?: string
  bill_date?: string
  due_date?: string
  subtotal?: number
  tax_amount?: number
  total?: number
  amount_due?: number
  status?: string
  contact_id?: number | string
  currency?: string
  lines?: PEAccountingBillLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: PEAccountingBillLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformBill(raw: PEAccountingBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.amount_due,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
