import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface PEAccountingCreditMemoLine {
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  account_id?: number | string
  [key: string]: unknown
}

export interface PEAccountingCreditMemo {
  id: number | string
  credit_note_number?: string
  date?: string
  contact_id?: number | string
  currency?: string
  total?: number
  tax_amount?: number
  status?: string
  lines?: PEAccountingCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch (status?.toLowerCase()) {
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

function mapLineitem(line: PEAccountingCreditMemoLine): Lineitem {
  return {
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformCreditMemo(raw: PEAccountingCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
