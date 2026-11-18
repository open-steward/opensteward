import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AppFolioCreditMemoLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface AppFolioCreditMemo {
  id: string | number
  credit_memo_number: string
  tenant_id: string | number
  property_id: string | number
  date: string
  amount: number
  tax_amount: number
  currency: string
  status: string
  line_items: AppFolioCreditMemoLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'draft':
      return 'DRAFT'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AppFolioCreditMemoLineItem): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformCreditMemo(raw: AppFolioCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.tenant_id ? String(raw.tenant_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
