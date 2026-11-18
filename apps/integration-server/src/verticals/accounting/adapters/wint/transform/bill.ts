import type { Bill, BillStatus } from '../../../schema/bill'

export interface WintBill {
  id: number | string
  number?: string
  supplier_id?: number | string
  date?: string
  due_date?: string
  currency?: string
  gross?: number
  vat?: number
  remaining?: number
  status?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'PAID'
    case 'sent':
    case 'overdue':
      return 'AUTHORIZED'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: WintBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.supplier_id != null ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat,
    balanceAmount: raw.remaining,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
