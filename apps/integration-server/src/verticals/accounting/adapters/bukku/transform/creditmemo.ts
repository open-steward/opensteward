import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface BukkuCreditNoteLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string | number
  account_code: string
  tax_rate_id: string | number
  discount: number
  [key: string]: unknown
}

export interface BukkuCreditNote {
  id: string | number
  number: string
  date: string
  total: number
  tax_total: number
  balance: number
  status: string
  contact_id: string | number
  contact_name: string
  line_items: BukkuCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'sent':
      return 'AUTHORIZED'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: BukkuCreditNoteLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount || undefined,
  }
}

export function transformCreditMemo(raw: BukkuCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
