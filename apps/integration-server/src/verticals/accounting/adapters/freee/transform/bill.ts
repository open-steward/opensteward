import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FreeeBillDetail {
  id: number
  item_name: string
  quantity: number
  unit_price: number
  amount: number
  tax_category: string | null
  account_item_id: number | null
  [key: string]: unknown
}

export interface FreeeBill {
  id: number
  issue_date: string
  due_date: string
  amount: number
  total_amount: number
  status: string
  partner_id: number | null
  partner_name: string | null
  details: FreeeBillDetail[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  if (status === 'paid') return 'PAID'
  if (status === 'approved') return 'AUTHORIZED'
  if (status === 'under_review') return 'AUTHORIZED'
  if (status === 'draft') return 'DRAFT'
  if (status === 'rejected') return 'VOIDED'
  return 'DRAFT'
}

function mapLineitem(row: FreeeBillDetail): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_item_id ? String(row.account_item_id) : undefined,
    itemDescription: row.item_name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
  }
}

export function transformBill(raw: FreeeBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status as string),
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.total_amount ?? raw.amount,
    balanceAmount: raw.amount,
    lineItems: (raw.details ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
