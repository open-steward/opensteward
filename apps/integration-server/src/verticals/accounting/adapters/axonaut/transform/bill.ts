import type { Bill } from '../../../schema/bill'

// Axonaut does not expose a dedicated supplier-invoice endpoint.
// Purchase bills are represented as expenses in Axonaut.
export interface AxonautBill {
  id: string
  title: string
  supplier_id: string
  pre_tax_amount: number
  tax_amount: number
  total_amount: number
  currency: string
  date: string
  accounting_code: string
  [key: string]: unknown
}

export function transformBill(raw: AxonautBill): Bill {
  return {
    id: String(raw.id),
    status: 'AUTHORIZED',
    billNumber: raw.title || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
