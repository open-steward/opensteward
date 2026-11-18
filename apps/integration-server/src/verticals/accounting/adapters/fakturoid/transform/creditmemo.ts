import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FakturoidCreditMemoLine {
  id: number
  name: string
  quantity: number
  unit_price: number
  vat_rate: number
  unit_price_without_vat: number
  unit_price_with_vat: number
  [key: string]: unknown
}

export interface FakturoidCreditMemo {
  id: number
  number: string
  subject_id: number
  status: string
  due_on: string
  issued_on: string
  total: number
  remaining_amount: number
  paid_amount: number
  currency: string
  vat_price: number
  lines: FakturoidCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(cm: FakturoidCreditMemo): CreditMemoStatus {
  switch (cm.status) {
    case 'paid':
      return 'PAID'
    case 'sent':
    case 'open':
      return 'AUTHORIZED'
    case 'overdue':
      return 'AUTHORIZED'
    case 'cancelled':
      return 'VOIDED'
    case 'partial':
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: FakturoidCreditMemoLine): Lineitem {
  return {
    id: String(row.id),
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.unit_price_with_vat * row.quantity,
    taxAmount: (row.unit_price_with_vat - row.unit_price_without_vat) * row.quantity || undefined,
  }
}

export function transformCreditMemo(raw: FakturoidCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.subject_id ? String(raw.subject_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_price,
    balanceAmount: raw.remaining_amount,
    paidAmount: raw.paid_amount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    dueAt: raw.due_on ? new Date(raw.due_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
