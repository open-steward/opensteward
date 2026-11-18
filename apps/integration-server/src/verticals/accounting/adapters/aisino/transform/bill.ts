import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AisinoBillLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface AisinoBill {
  invoiceId?: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  status?: number | string
  sellerId?: string
  currency?: string
  lines?: AisinoBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): BillStatus {
  switch (String(s)) {
    case '2': return 'PAID'
    case '1': return 'AUTHORIZED'
    case '3': return 'VOIDED'
    case '0': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: AisinoBill): Bill {
  return {
    id: raw.invoiceId ? String(raw.invoiceId) : undefined,
    status: mapStatus(raw.status),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.sellerId ? String(raw.sellerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
