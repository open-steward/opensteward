import type { Bill, BillStatus } from '../../../schema/bill'

export interface GiobbyBill {
  id: string
  invoice_no: string
  invoice_date: string
  payment_date: string
  amount_net: number
  amount_vat: number
  amount_gross: number
  amount_due: number
  invoice_status: string
  currency: string
  supplier_id: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: GiobbyBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.invoice_status),
    billNumber: raw.invoice_no || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_gross,
    taxAmount: raw.amount_vat,
    balanceAmount: raw.amount_due,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
