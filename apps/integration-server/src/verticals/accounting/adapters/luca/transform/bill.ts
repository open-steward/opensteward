import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'
import type { LucaLineItem } from './invoice'

export interface LucaBill {
  id: string
  bill_no?: string
  date?: string
  due_date?: string
  subtotal?: number
  vat?: number
  total?: number
  balance?: number
  status?: string
  currency?: string
  supplier_id?: string
  lines?: LucaLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: LucaBill): BillStatus {
  switch (raw.status?.toLowerCase()) {
    case 'received':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: LucaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_no || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.vat || undefined,
  }
}

export function transformBill(raw: LucaBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_no || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat,
    balanceAmount: raw.balance,
    lineItems: nonempty((raw.lines ?? []).map(mapLineitem)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
