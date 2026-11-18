import type { Bill, BillStatus } from '../../../schema/bill'

export interface LibeoBill {
  id: string
  reference: string
  supplier_id: string
  net_amount: number
  vat_amount: number
  total_amount: number
  remaining_amount: number
  currency: string
  issued_at: string
  due_at: string
  state: string
  [key: string]: unknown
}

function mapStatus(state: string): BillStatus {
  switch (state) {
    case 'approved': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: LibeoBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    billNumber: raw.reference || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
