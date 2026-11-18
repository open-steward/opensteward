import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface GustoCreditMemoLine {
  id: string | number
  description: string
  amount: number
  [key: string]: unknown
}

export interface GustoCreditMemo {
  id: string | number
  status: string
  date: string
  employee_id?: string | number
  total_amount: number
  tax_amount?: number
  currency?: string
  lines?: GustoCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'applied':
      return 'AUTHORIZED'
    case 'void':
      return 'VOIDED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: GustoCreditMemoLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
  }
}

export function transformCreditMemo(raw: GustoCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.employee_id ? String(raw.employee_id) : undefined,
    currency: raw.currency || 'USD',
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
