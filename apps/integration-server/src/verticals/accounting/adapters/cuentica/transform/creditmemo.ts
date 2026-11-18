import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface CuenticaCreditMemoRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  tax: number
  account: string
  [key: string]: unknown
}

export interface CuenticaCreditMemo {
  id: string
  number: string
  date: string
  due_date: string
  subtotal: number
  tax: number
  total: number
  outstanding: number
  status: string
  contact_id: string
  currency: string
  lines: CuenticaCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: CuenticaCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax,
  }
}

export function transformCreditMemo(raw: CuenticaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
