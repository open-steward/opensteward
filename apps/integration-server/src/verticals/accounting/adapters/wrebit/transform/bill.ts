import type { Bill, BillStatus } from '../../../schema/bill'

export interface WrebitBill {
  id: number | string
  ref?: string
  contact_id?: number | string
  date?: string
  due_date?: string
  currency?: string
  gross_amount?: number
  vat_amount?: number
  outstanding?: number
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: WrebitBill): BillStatus {
  switch (raw.status?.toLowerCase()) {
    case 'settled':
      return 'PAID'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'open':
      return 'AUTHORIZED'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: WrebitBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.ref || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
