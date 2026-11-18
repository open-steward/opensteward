import type { Bill, BillStatus } from '../../../schema/bill'

export interface InbooksBill {
  id: number | string
  bill_number?: string
  contact_id?: number | string
  bill_date?: string
  due_date?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  amount_due?: number
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: InbooksBill): BillStatus {
  switch (raw.status) {
    case 'Paid':
      return 'PAID'
    case 'PartiallyPaid':
      return 'PARTIALLY_PAID'
    case 'Open':
      return 'AUTHORIZED'
    case 'Void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: InbooksBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.amount_due,
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
