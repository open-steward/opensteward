import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'

export interface CentigaLineItem {
  id: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  account_id?: string
  [key: string]: unknown
}

export interface CentigaInvoice {
  id: string
  number?: string
  date?: string
  due_date?: string
  net_amount?: number
  tax_amount?: number
  total_amount?: number
  unpaid?: number
  status?: string
  currency?: string
  customer_id?: string
  line_items?: CentigaLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: CentigaInvoice): InvoiceStatus {
  switch (raw.status?.toLowerCase()) {
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: CentigaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformInvoice(raw: CentigaInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.unpaid,
    lineItems: nonempty((raw.line_items ?? []).map(mapLineitem)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
