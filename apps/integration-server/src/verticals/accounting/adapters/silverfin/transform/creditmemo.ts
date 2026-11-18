import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface SilverfinCreditMemoLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface SilverfinCreditMemo {
  id: string | number
  status: string
  credit_note_number: string
  period: string
  total_amount: number
  tax_amount: number
  currency: string
  contact_id: string | number
  lines: SilverfinCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SilverfinCreditMemoLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_amount,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformCreditMemo(raw: SilverfinCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.period ? new Date(raw.period) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
