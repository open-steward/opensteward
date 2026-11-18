import type { Bill, BillStatus } from '../../../schema/bill'

export interface SistemiBill {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  outstanding_amount: number
  status: string
  currency: string
  supplier_id: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'ISSUED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: SistemiBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding_amount,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
