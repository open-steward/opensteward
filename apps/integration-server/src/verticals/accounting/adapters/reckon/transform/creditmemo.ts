import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonCreditNoteLineItem {
  id: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
  taxAmount: number
  accountId: string
  taxCodeId: string
  discountAmount: number
  [key: string]: unknown
}

export interface ReckonCreditNote {
  id: string
  creditNoteNumber: string
  date: string
  totalAmount: number
  totalTax: number
  balance: number
  contactId: string
  contactName: string
  status: string
  lineItems: ReckonCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return 'DRAFT'
    case 'AUTHORIZED':
    case 'OPEN':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'PARTIAL':
      return 'PARTIALLY_PAID'
    case 'VOID':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: ReckonCreditNoteLineItem): Lineitem {
  return {
    id: item.id || undefined,
    accountId: item.accountId || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitAmount,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.taxAmount || undefined,
    taxrateId: item.taxCodeId || undefined,
    discountAmount: item.discountAmount || undefined,
  }
}

export function transformCreditMemo(raw: ReckonCreditNote): CreditMemo {
  const paidAmount = raw.totalAmount != null && raw.balance != null
    ? raw.totalAmount - raw.balance
    : undefined

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.contactId || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.totalTax || undefined,
    balanceAmount: raw.balance,
    paidAmount: paidAmount && paidAmount > 0 ? paidAmount : undefined,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
