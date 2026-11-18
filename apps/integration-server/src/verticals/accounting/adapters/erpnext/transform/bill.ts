import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ErpNextBillItem {
  name: string
  item_name: string
  qty: number
  rate: number
  amount: number
  item_tax_amount: number
  expense_account: string
  [key: string]: unknown
}

export interface ErpNextBill {
  name: string
  posting_date: string
  due_date: string
  base_grand_total: number
  base_total_taxes_and_charges: number
  outstanding_amount: number
  status: string
  currency: string
  supplier: string
  remarks: string
  items: ErpNextBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Submitted': return 'AUTHORIZED'
    case 'Partly Paid': return 'PARTIALLY_PAID'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    case 'Overdue': return 'OVERDUE'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: ErpNextBillItem): Lineitem {
  return {
    id: item.name || undefined,
    accountId: item.expense_account || undefined,
    itemDescription: item.item_name || undefined,
    unitAmount: item.rate,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.item_tax_amount || undefined,
  }
}

export function transformBill(raw: ErpNextBill): Bill {
  return {
    id: raw.name,
    status: mapStatus(raw.status),
    billNumber: raw.name,
    contactId: raw.supplier || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.base_grand_total,
    taxAmount: raw.base_total_taxes_and_charges || undefined,
    balanceAmount: raw.outstanding_amount,
    notes: raw.remarks || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.posting_date ? new Date(raw.posting_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
