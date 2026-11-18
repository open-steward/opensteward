import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface QuipuCreditMemoRow {
  id: number
  concept: string
  unitary_amount: number
  quantity: number
  total_amount: number
  taxes_amounts: number
  account_id: string
  [key: string]: unknown
}

export interface QuipuCreditMemo {
  id: string
  number: string
  issued_at: string
  due_at: string
  amount_without_taxes: number
  taxes_amounts: number
  total_amount: number
  unpaid_amount: number
  payment_status: string
  contact_id: string
  currency: string
  items: QuipuCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(payment_status: string): CreditMemoStatus {
  switch (payment_status) {
    case 'outstanding': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'overdue': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: QuipuCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.concept || undefined,
    unitAmount: row.unitary_amount,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.taxes_amounts,
  }
}

export function transformCreditMemo(raw: QuipuCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.payment_status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.taxes_amounts,
    balanceAmount: raw.unpaid_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issued_at ? new Date(raw.issued_at) : undefined,
    dueAt: raw.due_at ? new Date(raw.due_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
