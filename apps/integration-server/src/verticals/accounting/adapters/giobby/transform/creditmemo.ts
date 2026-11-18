import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface GiobbyCreditMemoLine {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount_gross: number
  amount_vat: number
  account_code: string
  [key: string]: unknown
}

export interface GiobbyCreditMemo {
  id: string
  invoice_no: string
  invoice_date: string
  payment_date: string
  amount_net: number
  amount_vat: number
  amount_gross: number
  amount_due: number
  invoice_status: string
  currency: string
  contact_id: string
  items?: GiobbyCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: GiobbyCreditMemoLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_gross,
    taxAmount: row.amount_vat,
  }
}

export function transformCreditMemo(raw: GiobbyCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.invoice_status),
    creditmemoNumber: raw.invoice_no || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_gross,
    taxAmount: raw.amount_vat,
    balanceAmount: raw.amount_due,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
