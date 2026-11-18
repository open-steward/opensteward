import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AmanoteCreditMemoItem {
  description?: string
  quantity?: number
  unit_price?: number
  tax?: number
  total?: number
  [key: string]: unknown
}

export interface AmanoteCreditMemo {
  id: string | number
  number?: string
  date?: string
  due_date?: string
  subtotal?: number
  tax?: number
  total?: number
  balance?: number
  status?: string
  currency?: string
  contact_id?: string | number
  items?: AmanoteCreditMemoItem[]
  [key: string]: unknown
}

function toCreditMemoStatus(status: string | undefined): CreditMemoStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: AmanoteCreditMemo): CreditMemo {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax,
    totalAmount: item.total,
    metadata: item as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    creditmemoNumber: raw.number,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.balance,
    status: toCreditMemoStatus(raw.status),
    currency: raw.currency,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
