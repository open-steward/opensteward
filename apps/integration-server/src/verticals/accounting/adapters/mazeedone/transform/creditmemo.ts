import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface MazeedOneCreditNoteLine {
  id: string | number
  description: string
  qty: number
  unit_price: number
  total: number
  vat_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface MazeedOneCreditNote {
  id: string | number
  credit_note_no: string
  date: string
  due_date: string
  subtotal: number
  vat_amount: number
  total: number
  outstanding: number
  state: string
  client_id: string | number
  currency: string
  lines: MazeedOneCreditNoteLine[]
  [key: string]: unknown
}

function mapStatus(state: string): CreditMemoStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MazeedOneCreditNoteLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformCreditMemo(raw: MazeedOneCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    creditmemoNumber: raw.credit_note_no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.outstanding,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
