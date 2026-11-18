import type { Bill, BillStatus } from '../../../schema/bill'

export interface MeritaktivaBill {
  Id: string | number
  InvoiceNo?: string
  InvoiceDate?: string
  DueDate?: string
  TotalSum?: number
  TaxSum?: number
  Paid?: boolean
  SupplierId?: string | number
  Currency?: string
  [key: string]: unknown
}

function mapStatus(raw: MeritaktivaBill): BillStatus {
  if (raw.Paid) return 'PAID'
  return 'DRAFT'
}

export function transformBill(raw: MeritaktivaBill): Bill {
  return {
    id: String(raw.Id),
    status: mapStatus(raw),
    billNumber: raw.InvoiceNo || undefined,
    contactId: raw.SupplierId != null ? String(raw.SupplierId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalSum,
    taxAmount: raw.TaxSum,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
