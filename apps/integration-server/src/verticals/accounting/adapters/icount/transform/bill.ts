import type { Bill, BillStatus } from '../../../schema/bill'
import type { ICountInvoice } from './invoice'

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: ICountInvoice): Bill {
  return {
    id: raw.doc_id,
    status: mapStatus(raw.status),
    billNumber: raw.doc_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vat_sum,
    notes: raw.description as string | undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
