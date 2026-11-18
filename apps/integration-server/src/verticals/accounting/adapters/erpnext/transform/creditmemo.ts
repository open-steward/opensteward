import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ErpNextCreditMemoItem {
  name: string
  item_name: string
  qty: number
  rate: number
  amount: number
  item_tax_amount: number
  income_account: string
  [key: string]: unknown
}

export interface ErpNextCreditMemo {
  name: string
  posting_date: string
  due_date: string
  base_grand_total: number
  base_total_taxes_and_charges: number
  outstanding_amount: number
  status: string
  currency: string
  customer: string
  remarks: string
  is_return: number | boolean
  items: ErpNextCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Submitted': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Partly Paid': return 'PARTIALLY_PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: ErpNextCreditMemoItem): Lineitem {
  return {
    id: item.name || undefined,
    accountId: item.income_account || undefined,
    itemDescription: item.item_name || undefined,
    unitAmount: item.rate,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.item_tax_amount || undefined,
  }
}

export function transformCreditMemo(raw: ErpNextCreditMemo): CreditMemo {
  return {
    id: raw.name,
    status: mapStatus(raw.status),
    contactId: raw.customer || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.base_grand_total,
    taxAmount: raw.base_total_taxes_and_charges || undefined,
    balanceAmount: raw.outstanding_amount,
    notes: raw.remarks || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.posting_date ? new Date(raw.posting_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
