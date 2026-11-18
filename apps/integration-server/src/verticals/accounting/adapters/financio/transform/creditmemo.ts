import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FinancioCreditNoteItem {
  id: string | number
  description: string
  qty: number
  unit_price: number
  amount: number
  tax_amount: number
  account_code: string
  tax_rate: number
  discount_amount: number
  [key: string]: unknown
}

export interface FinancioCreditNote {
  id: string | number
  credit_note_no: string
  credit_note_date: string
  sub_total: number
  tax_total: number
  grand_total: number
  outstanding: number
  customer_id: string | number
  customer_name: string
  status: number
  items: FinancioCreditNoteItem[]
  [key: string]: unknown
}

function mapStatus(status: number): CreditMemoStatus {
  switch (status) {
    case 1:
      return 'AUTHORIZED'
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FinancioCreditNoteItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount_amount || undefined,
  }
}

export function transformCreditMemo(raw: FinancioCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_no || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.outstanding,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.credit_note_date ? new Date(raw.credit_note_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
