import type { Bill, BillStatus } from '../../../schema/bill'

export interface SmartaccountsBill {
  id: string | number
  number?: string
  date?: string
  due_date?: string
  total?: number
  tax?: number
  status?: string
  supplier_id?: string | number
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'issued':
    case 'authorized': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void':
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: SmartaccountsBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.supplier_id != null ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
