import type { Bill, BillStatus } from '../../../schema/bill'

export interface ContaBill {
  id: string
  bill_number?: string
  invoice_date?: string
  due_date?: string
  amount_ex_vat?: number
  vat_amount?: number
  amount_inc_vat?: number
  outstanding?: number
  status?: string
  currency?: string
  supplier_id?: string
  [key: string]: unknown
}

function mapStatus(raw: ContaBill): BillStatus {
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

export function transformBill(raw: ContaBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_inc_vat,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
