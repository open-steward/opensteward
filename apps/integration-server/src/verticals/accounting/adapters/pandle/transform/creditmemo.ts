import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface PandleCreditMemoLine {
  id: number
  account_id: number
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate_id: number
  tax_amount: number
  total_amount: number
  [key: string]: unknown
}

export interface PandleCreditMemo {
  id: number
  credit_note_number: string
  customer_id: number
  currency: string
  issue_date: string
  status: string
  net_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  balance: number
  credit_note_lines: PandleCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(raw: PandleCreditMemo): CreditMemoStatus {
  const s = raw.status?.toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'part_paid') return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'authorized') return 'AUTHORIZED'
  if (s === 'draft') return 'DRAFT'
  return 'DRAFT'
}

function mapLineitem(row: PandleCreditMemoLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.tax_amount || undefined,
    taxrateId: row.tax_rate_id ? String(row.tax_rate_id) : undefined,
  }
}

export function transformCreditMemo(raw: PandleCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    paidAmount: raw.paid_amount || undefined,
    balanceAmount: raw.balance,
    lineItems: (raw.credit_note_lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
