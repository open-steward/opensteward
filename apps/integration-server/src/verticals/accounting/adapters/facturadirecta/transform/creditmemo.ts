import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FacturadirectaCreditMemoRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  total: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface FacturadirectaCreditMemo {
  id: string
  document_number: string
  document_date: string
  payment_date: string
  base_amount: number
  tax_amount: number
  total_amount: number
  pending_amount: number
  document_status: string
  client_id: string
  currency: string
  lines: FacturadirectaCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(document_status: string): CreditMemoStatus {
  switch (document_status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: FacturadirectaCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount,
  }
}

export function transformCreditMemo(raw: FacturadirectaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.document_status),
    creditmemoNumber: raw.document_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.pending_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.document_date ? new Date(raw.document_date) : undefined,
    dueAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
