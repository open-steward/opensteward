import type { Bill, BillStatus } from '../../../schema/bill'

export interface InvoiceXpressBillStatus {
  name: string
  [key: string]: unknown
}

export interface InvoiceXpressBill {
  id: number
  status: InvoiceXpressBillStatus
  date: string
  due_date: string
  total: number
  tax_amount: number
  currency: string
  [key: string]: unknown
}

function mapStatus(statusName: string): BillStatus {
  switch (statusName) {
    case 'draft': return 'DRAFT'
    case 'sent': return 'AUTHORIZED'
    case 'settled': return 'PAID'
    case 'canceled': return 'VOIDED'
    case 'second_copy': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: InvoiceXpressBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status?.name ?? ''),
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
