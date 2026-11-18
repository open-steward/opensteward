import type { Bill, BillStatus } from '../../../schema/bill'

export interface SuperbillBill {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  net_amount: number
  vat_amount: number
  total_amount: number
  balance: number
  status: string
  currency: string
  supplier_id: string
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

export function transformBill(raw: SuperbillBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.balance,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
