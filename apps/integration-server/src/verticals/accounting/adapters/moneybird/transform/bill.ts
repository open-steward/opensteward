import type { Bill, BillStatus } from '../../../schema/bill'

export interface MoneybirdBill {
  id?: number | string
  reference?: string
  contact_id?: number | string
  total_price_incl_tax?: string | number
  tax_amount?: string | number
  total_unpaid?: string | number
  currency?: string
  state?: string
  date?: string
  due_date?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): BillStatus {
  switch (state) {
    case 'new':
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'late':
      return 'OVERDUE'
    case 'paid':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: MoneybirdBill): Bill {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    billNumber: raw.reference || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.state),
    totalAmount: raw.total_price_incl_tax !== undefined ? Number(raw.total_price_incl_tax) : undefined,
    taxAmount: raw.tax_amount !== undefined ? Number(raw.tax_amount) : undefined,
    balanceAmount: raw.total_unpaid !== undefined ? Number(raw.total_unpaid) : undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
