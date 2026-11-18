import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ZohoBooksCreditNoteLineItem {
  line_item_id: string
  item_id: string
  description: string
  rate: number
  quantity: number
  item_total: number
  tax_amount: number
  account_id: string
}

export interface ZohoBooksCreditNote {
  creditnote_id: string
  creditnote_number: string
  customer_id: string
  date: string
  currency_code: string
  total: number
  balance: number
  tax_total: number
  status: 'draft' | 'open' | 'closed' | 'void'
  line_items?: ZohoBooksCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(status: ZohoBooksCreditNote['status']): CreditMemoStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'closed': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineItem(li: ZohoBooksCreditNoteLineItem): Lineitem {
  return {
    id: li.line_item_id || undefined,
    itemId: li.item_id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.rate,
    unitQuantity: li.quantity,
    totalAmount: li.item_total,
    taxAmount: li.tax_amount || undefined,
    accountId: li.account_id || undefined,
  }
}

export function transformCreditMemo(raw: ZohoBooksCreditNote): CreditMemo {
  return {
    id: raw.creditnote_id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditnote_number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance,
    paidAmount: raw.total - raw.balance || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
