import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface MaxioCreditNoteLineItem {
  uid: string
  title: string
  description: string
  quantity: string
  unit_price: string
  subtotal_amount: string
  tax_amount: string
  [key: string]: unknown
}

export interface MaxioCreditNote {
  uid: string
  number: string
  state: string
  issued_date: string
  currency: string
  total_amount: string
  tax_amount: string
  customer_id: number | null
  line_items: MaxioCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(state: string): CreditMemoStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'applied':
      return 'PAID'
    case 'voided':
    case 'canceled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MaxioCreditNoteLineItem): Lineitem {
  return {
    id: line.uid,
    itemDescription: line.title || line.description || undefined,
    unitAmount: parseFloat(line.unit_price) || 0,
    unitQuantity: parseFloat(line.quantity) || 1,
    totalAmount: parseFloat(line.subtotal_amount) || 0,
    taxAmount: parseFloat(line.tax_amount) || undefined,
  }
}

export function transformCreditMemo(raw: MaxioCreditNote): CreditMemo {
  return {
    id: raw.uid,
    status: mapStatus(raw.state),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_amount) || 0,
    taxAmount: parseFloat(raw.tax_amount) || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.issued_date ? new Date(raw.issued_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
