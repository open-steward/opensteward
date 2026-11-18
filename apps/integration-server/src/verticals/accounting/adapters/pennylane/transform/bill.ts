import type { Bill, BillStatus } from '../../../schema/bill'

export interface PennylaneBill {
  id: string
  invoice_number: string
  supplier: { source_id: string; name: string } | null
  date: string
  deadline: string | null
  currency: string
  amount: number
  remaining_amount: number
  status: 'draft' | 'not_sent' | 'sent' | 'received' | 'partially_paid' | 'paid' | 'cancelled'
  [key: string]: unknown
}

function mapStatus(status: PennylaneBill['status']): BillStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'not_sent':
    case 'sent':
    case 'received':
      return 'AUTHORIZED'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: PennylaneBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.supplier?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    balanceAmount: raw.remaining_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.deadline ? new Date(raw.deadline) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
