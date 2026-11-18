import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface YonyouInvoiceLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface YonyouInvoice {
  id?: string
  code?: string
  vouchdate?: string
  duedate?: string
  ttaxmny?: number
  tax?: number
  status?: number | string
  custid?: string
  currency?: string
  lines?: YonyouInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): InvoiceStatus {
  switch (String(s)) {
    case '2': return 'PAID'
    case '1': return 'AUTHORIZED'
    case '3': return 'VOIDED'
    case '0': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: YonyouInvoice): Invoice {
  return {
    id: raw.id ? String(raw.id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.code || undefined,
    contactId: raw.custid ? String(raw.custid) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.ttaxmny,
    taxAmount: raw.tax,
    balanceAmount: raw.ttaxmny,
    postedAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
    dueAt: raw.duedate ? new Date(raw.duedate) : undefined,
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
