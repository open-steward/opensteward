import type { Bill, BillStatus } from '../../../schema/bill'

export interface BrioxBill {
  id: number | string
  bill_number?: string
  supplier_id?: number | string
  bill_date?: string
  due_date?: string
  currency?: string
  total?: number
  vat_amount?: number
  remaining?: number
  status?: number | string
  [key: string]: unknown
}

function mapStatus(status?: number | string): BillStatus {
  const s = typeof status === 'number' ? status : Number(status)
  if (!isNaN(s)) {
    switch (s) {
      case 1: return 'DRAFT'
      case 2: return 'AUTHORIZED'
      case 3: return 'PAID'
      case 4: return 'VOIDED'
    }
  }
  switch (String(status).toLowerCase()) {
    case 'paid': return 'PAID'
    case 'authorized': return 'AUTHORIZED'
    case 'voided':
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: BrioxBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.bill_number || undefined,
    contactId: raw.supplier_id != null ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining,
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
