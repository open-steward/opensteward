import type { Bill, BillStatus } from '../../../schema/bill'

export interface SinaoBill {
  id: string
  number: string
  supplier_id: string
  amount_excl_tax: number
  tax_amount: number
  amount_incl_tax: number
  balance: number
  currency: string
  date: string
  due_date: string
  status: string
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

export function transformBill(raw: SinaoBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_tax,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.balance,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
