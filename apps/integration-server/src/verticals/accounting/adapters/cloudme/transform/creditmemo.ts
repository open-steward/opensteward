import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface CloudMeCreditNoteLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface CloudMeCreditNote {
  id: string | number
  credit_note_number: string
  date: string
  due_date: string
  sub_total: number
  tax: number
  total: number
  balance_due: number
  status: string
  customer_id: string | number
  currency_code: string
  line_items: CloudMeCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: CloudMeCreditNoteLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformCreditMemo(raw: CloudMeCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.balance_due,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
