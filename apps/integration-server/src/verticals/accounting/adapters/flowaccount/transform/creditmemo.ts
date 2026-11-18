import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FlowAccountCreditMemoItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  [key: string]: unknown
}

export interface FlowAccountCreditMemo {
  id: string | number
  date: string
  statusId: number
  amountTotal: number
  vatTotal: number
  contactCode: string
  currencyCode: string
  items: FlowAccountCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(statusId: number): CreditMemoStatus {
  switch (statusId) {
    case 3:
      return 'PAID'
    case 2:
      return 'AUTHORIZED'
    case 4:
      return 'VOIDED'
    case 1:
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FlowAccountCreditMemoItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformCreditMemo(raw: FlowAccountCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statusId),
    contactId: raw.contactCode || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amountTotal,
    taxAmount: raw.vatTotal || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
