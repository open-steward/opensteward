import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface RegateCreditMemoLine {
  id: number
  product_id: string
  quantity: number
  reference: string
  unit_price_cents: number
  sales_vat_account_id: string
  [key: string]: unknown
}

export interface RegateCreditMemo {
  id: string
  invoice_number: string
  customer_id: string
  issue_date: string
  due_date: string
  gross_amount_cents: number
  vat_amount_cents: number
  including_taxes_amount_cents: number
  paid_amount_cents: number
  state: string
  currency: string
  lines: RegateCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(state: string): CreditMemoStatus {
  switch (state) {
    case 'received':
    case 'recorded': return 'AUTHORIZED'
    case 'paid':
    case 'reconciled': return 'PAID'
    case 'excluded': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: RegateCreditMemoLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.sales_vat_account_id || undefined,
    itemDescription: row.reference || undefined,
    unitAmount: (row.unit_price_cents ?? 0) / 100,
    unitQuantity: row.quantity,
    totalAmount: (row.unit_price_cents ?? 0) * (row.quantity ?? 1) / 100,
  }
}

export function transformCreditMemo(raw: RegateCreditMemo): CreditMemo {
  const totalCents = raw.including_taxes_amount_cents ?? 0
  const taxCents = raw.vat_amount_cents ?? 0
  const paidCents = raw.paid_amount_cents ?? 0
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    creditmemoNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: totalCents / 100,
    taxAmount: taxCents / 100,
    balanceAmount: (totalCents - paidCents) / 100,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
