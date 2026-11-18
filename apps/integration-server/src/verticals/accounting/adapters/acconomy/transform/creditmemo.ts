import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AcconomyCreditMemoLine {
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  tax?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface AcconomyCreditMemo {
  id: number | string
  credit_note_number?: string
  date?: string
  contact_id?: number | string
  currency?: string
  total?: number
  tax?: number
  state?: string
  lines?: AcconomyCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(state?: string): CreditMemoStatus {
  switch (state?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'applied':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcconomyCreditMemoLine): Lineitem {
  return {
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.qty,
    totalAmount: line.total,
    taxAmount: line.tax || undefined,
  }
}

export function transformCreditMemo(raw: AcconomyCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
