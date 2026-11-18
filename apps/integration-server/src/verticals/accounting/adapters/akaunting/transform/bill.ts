import type { Bill, BillStatus } from '../../../schema/bill'

export interface AkauntingBill {
  id: number
  document_number: string
  contact_id: number
  contact_name: string
  currency_code: string
  issued_at: string
  due_at: string
  status: string
  amount: number
  tax_total: number
  paid: number
  category_id: number
  [key: string]: unknown
}

function mapStatus(raw: AkauntingBill): BillStatus {
  const s = raw.status?.toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'received' || s === 'sent' || s === 'viewed') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: AkauntingBill): Bill {
  const balance = raw.amount != null && raw.paid != null ? raw.amount - raw.paid : undefined
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.document_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_total,
    balanceAmount: balance,
    paidAmount: raw.paid || undefined,
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
