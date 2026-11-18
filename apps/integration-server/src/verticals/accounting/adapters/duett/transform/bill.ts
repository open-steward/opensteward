import type { Bill, BillStatus } from '../../../schema/bill'

export interface DuettBill {
  id: string
  bill_number?: string
  invoice_date?: string
  due_date?: string
  net?: number
  tax?: number
  gross?: number
  outstanding?: number
  status?: string
  currency?: string
  supplier_id?: string
  [key: string]: unknown
}

function mapStatus(raw: DuettBill): BillStatus {
  switch (raw.status?.toLowerCase()) {
    case 'received':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: DuettBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.tax,
    balanceAmount: raw.outstanding,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
