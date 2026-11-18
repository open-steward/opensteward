import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface InvoiceqCreditMemoLineItem {
  item_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  [key: string]: unknown
}

export interface InvoiceqCreditMemo {
  id: string
  credit_memo_number?: string
  date?: string
  due_date?: string
  vat_amount?: number
  total_amount?: number
  remaining_amount?: number
  status?: string
  customer_id?: string
  currency_code?: string
  line_items?: InvoiceqCreditMemoLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Active':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: InvoiceqCreditMemoLineItem): Lineitem {
  return {
    itemId: item.item_id ? String(item.item_id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.vat_amount,
  }
}

export function transformCreditMemo(raw: InvoiceqCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
