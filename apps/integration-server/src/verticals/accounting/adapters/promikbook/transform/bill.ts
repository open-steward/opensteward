import type { Bill, BillStatus } from '../../../schema/bill'

export interface PromikBookBill {
  id: number | string
  bill_no?: string
  supplier_id?: number | string
  date?: string
  due_date?: string
  currency?: string
  amount_incl_vat?: number
  vat_amount?: number
  unpaid?: number
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: PromikBookBill): BillStatus {
  switch (raw.status?.toLowerCase()) {
    case 'paid':
      return 'PAID'
    case 'partially_paid':
    case 'partiallypaid':
      return 'PARTIALLY_PAID'
    case 'active':
    case 'authorized':
      return 'AUTHORIZED'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: PromikBookBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.bill_no || undefined,
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_vat,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.unpaid,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
