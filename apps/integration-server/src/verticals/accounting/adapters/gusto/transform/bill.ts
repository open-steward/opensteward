import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface GustoBillLine {
  id: string | number
  description: string
  amount: number
  [key: string]: unknown
}

export interface GustoBill {
  id: string | number
  status: string
  due_date: string
  vendor_id: string | number
  total_amount: number
  tax_amount?: number
  currency?: string
  lines?: GustoBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'approved':
      return 'AUTHORIZED'
    case 'void':
      return 'VOIDED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: GustoBillLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
  }
}

export function transformBill(raw: GustoBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || 'USD',
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
