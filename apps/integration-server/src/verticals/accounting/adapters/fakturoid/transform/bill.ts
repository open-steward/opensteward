import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FakturoidBillLine {
  id: number
  name: string
  quantity: number
  unit_price: number
  vat_rate: number
  unit_price_without_vat: number
  unit_price_with_vat: number
  [key: string]: unknown
}

export interface FakturoidBill {
  id: number
  number: string
  subject_id: number
  status: string
  due_on: string
  issued_on: string
  total: number
  remaining_amount: number
  paid_amount: number
  currency: string
  vat_price: number
  lines: FakturoidBillLine[]
  [key: string]: unknown
}

function mapStatus(bill: FakturoidBill): BillStatus {
  switch (bill.status) {
    case 'paid':
      return 'PAID'
    case 'sent':
    case 'open':
      return 'SUBMITTED'
    case 'overdue':
      return 'OVERDUE'
    case 'cancelled':
      return 'VOIDED'
    case 'partial':
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: FakturoidBillLine): Lineitem {
  return {
    id: String(row.id),
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.unit_price_with_vat * row.quantity,
    taxAmount: (row.unit_price_with_vat - row.unit_price_without_vat) * row.quantity || undefined,
  }
}

export function transformBill(raw: FakturoidBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.subject_id ? String(raw.subject_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_price,
    balanceAmount: raw.remaining_amount,
    paidAmount: raw.paid_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    dueAt: raw.due_on ? new Date(raw.due_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
