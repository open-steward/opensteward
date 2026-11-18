import type { Bill, BillStatus } from '../../../schema/bill'

export interface CloudFinanceBill {
  id: string
  number: string
  date: string
  expiry_date: string
  taxable_amount: number
  vat_amount: number
  total_amount: number
  remaining_amount: number
  status: string
  currency: string
  supplier_id: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'issued': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: CloudFinanceBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.expiry_date ? new Date(raw.expiry_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
