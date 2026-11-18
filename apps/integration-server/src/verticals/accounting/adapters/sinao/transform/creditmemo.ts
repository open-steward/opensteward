import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface SinaoCreditMemoRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  amount_excl_tax: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface SinaoCreditMemo {
  id: string
  number: string
  contact_id: string
  date: string
  due_date: string
  amount_excl_tax: number
  tax_amount: number
  amount_incl_tax: number
  balance: number
  status: string
  currency: string
  lines: SinaoCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: SinaoCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_excl_tax,
    taxAmount: row.tax_amount,
  }
}

export function transformCreditMemo(raw: SinaoCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_tax,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
