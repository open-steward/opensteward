import type { Bill, BillStatus } from '../../../schema/bill'

export interface BillinBill {
  id: string
  invoice_number: string
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  remaining: number
  status: string
  supplier_id: string
  currency: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: BillinBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.remaining,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
