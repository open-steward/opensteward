import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FatouraCreditMemoItem {
  id?: string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface FatouraCreditMemo {
  id: string
  credit_memo_no?: string
  issue_date?: string
  due_date?: string
  tax_amount?: number
  total_amount?: number
  paid_amount?: number
  status?: string
  client_id?: string
  currency?: string
  items?: FatouraCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch (status) {
    case 'pending':
      return 'DRAFT'
    case 'active':
      return 'AUTHORIZED'
    case 'settled':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FatouraCreditMemoItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.tax_amount,
  }
}

export function transformCreditMemo(raw: FatouraCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_memo_no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
