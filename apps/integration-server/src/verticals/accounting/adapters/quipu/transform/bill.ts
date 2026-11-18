import type { Bill, BillStatus } from '../../../schema/bill'

export interface QuipuBill {
  id: string
  number: string
  issued_at: string
  due_at: string
  amount_without_taxes: number
  taxes_amounts: number
  total_amount: number
  unpaid_amount: number
  payment_status: string
  contact_id: string
  currency: string
  [key: string]: unknown
}

function mapStatus(payment_status: string): BillStatus {
  switch (payment_status) {
    case 'outstanding': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'overdue': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: QuipuBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.payment_status),
    billNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.taxes_amounts,
    balanceAmount: raw.unpaid_amount,
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
