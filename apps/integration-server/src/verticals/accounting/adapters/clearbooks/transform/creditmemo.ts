import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ClearBooksCreditMemoLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_net: number
  tax_amount: number
  account_code: string
  [key: string]: unknown
}

export interface ClearBooksCreditMemo {
  credit_note_id: string | number
  credit_note_number: string
  entity_id: string | number
  date_created: string
  total_gross: number
  total_net: number
  total_tax: number
  currency: string
  status: string
  line_items: ClearBooksCreditMemoLineItem[]
  [key: string]: unknown
}

function parseUkDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
  return new Date(dateStr)
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'unpaid':
      return 'AUTHORIZED'
    case 'draft':
      return 'DRAFT'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ClearBooksCreditMemoLineItem): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_code || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_net,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformCreditMemo(raw: ClearBooksCreditMemo): CreditMemo {
  return {
    id: String(raw.credit_note_id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.entity_id ? String(raw.entity_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_gross,
    taxAmount: raw.total_tax,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: parseUkDate(raw.date_created as string),
    metadata: raw as Record<string, unknown>,
  }
}
