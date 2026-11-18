import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// AccountsPortal purchase invoice (bill) wire shape
export interface APBillLine {
  id: number
  account_id: number
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate_id: number | null
  tax_amount: number
  total_amount: number
  [key: string]: unknown
}

export interface APBill {
  id: number
  bill_number: string
  contact_id: number
  currency: string
  issue_date: string
  due_date: string
  status: string            // 'draft' | 'approved' | 'paid' | 'part_paid' | 'void'
  net_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  balance: number
  notes: string | null
  bill_lines: APBillLine[]
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapStatus(raw: APBill): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'part_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'approved' || s === 'authorized') return 'AUTHORIZED'
  if (s === 'draft') return 'DRAFT'
  if (raw.balance === 0 && raw.total_amount > 0) return 'PAID'
  if (raw.balance > 0 && raw.balance < raw.total_amount) return 'PARTIALLY_PAID'
  if (raw.due_date && new Date(raw.due_date).getTime() < Date.now() && raw.balance > 0) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLine(row: APBillLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: toMinorUnits(row.unit_price),
    unitQuantity: row.quantity,
    taxAmount: toMinorUnits(row.tax_amount) || undefined,
    taxrateId: row.tax_rate_id ? String(row.tax_rate_id) : undefined,
    totalAmount: toMinorUnits(row.total_amount),
  }
}

export function transformBill(raw: APBill): Bill {
  // Bills (purchase invoices) are always against suppliers; prefix 's_' mirrors transformContact's id scheme.
  const contactId = raw.contact_id != null ? `s_${raw.contact_id}` : undefined
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.total_amount),
    taxAmount: toMinorUnits(raw.tax_amount) || undefined,
    paidAmount: toMinorUnits(raw.paid_amount) || undefined,
    balanceAmount: toMinorUnits(raw.balance),
    notes: raw.notes || undefined,
    lineItems: (raw.bill_lines ?? []).map(mapLine),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
