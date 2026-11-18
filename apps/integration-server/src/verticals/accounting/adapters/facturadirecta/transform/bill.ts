import type { Bill, BillStatus } from '../../../schema/bill'

export interface FacturadirectaBill {
  id: string
  document_number: string
  document_date: string
  payment_date: string
  base_amount: number
  tax_amount: number
  total_amount: number
  pending_amount: number
  document_status: string
  supplier_id: string
  currency: string
  [key: string]: unknown
}

function mapStatus(document_status: string): BillStatus {
  switch (document_status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: FacturadirectaBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.document_status),
    billNumber: raw.document_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.pending_amount,
    postedAt: raw.document_date ? new Date(raw.document_date) : undefined,
    dueAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
