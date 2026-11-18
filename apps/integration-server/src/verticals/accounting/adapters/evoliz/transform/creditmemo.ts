import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface EvolizCreditMemoRow {
  id: number
  designation: string
  unit_price: number
  quantity: number
  total_without_taxes: number
  total_taxes: number
  account_code: string
  [key: string]: unknown
}

export interface EvolizCreditMemo {
  id: string
  invoice_no: string
  client_id: string
  invoice_date: string
  due_date: string
  total_without_taxes: number
  total_taxes: number
  total_with_taxes: number
  balance_due: number
  invoice_status: string
  currency: string
  items: EvolizCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(invoice_status: string): CreditMemoStatus {
  switch (invoice_status) {
    case 'SENT': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'CANCELLED': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: EvolizCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.designation || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_without_taxes,
    taxAmount: row.total_taxes,
  }
}

export function transformCreditMemo(raw: EvolizCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.invoice_status),
    creditmemoNumber: raw.invoice_no || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_with_taxes,
    taxAmount: raw.total_taxes,
    balanceAmount: raw.balance_due,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
