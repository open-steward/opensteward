import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import type { DeskeraDocumentItem } from './invoice'

export interface DeskeraCreditMemo {
  id: string
  documentSequenceCode?: string
  documentDate?: string
  totalAmount?: number
  taxAmount?: number
  balance?: number
  contactCode?: string
  contactName?: string
  status?: string
  documentItems?: DeskeraDocumentItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch (status) {
    case 'DRAFT':
      return 'DRAFT'
    case 'OPEN':
      return 'AUTHORIZED'
    case 'PARTIAL':
      return 'PARTIALLY_PAID'
    case 'PAID':
      return 'PAID'
    case 'VOID':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: DeskeraDocumentItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.accountCode || undefined,
    itemDescription: item.description || item.name || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.totalAmount ?? 0,
    taxAmount: item.taxAmount || undefined,
    discountAmount: item.discountAmount || undefined,
  }
}

export function transformCreditMemo(raw: DeskeraCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.documentSequenceCode || raw.id,
    contactId: raw.contactCode || undefined,
    totalAmount: raw.totalAmount ?? 0,
    taxAmount: raw.taxAmount ?? 0,
    balanceAmount: raw.balance,
    lineItems: (raw.documentItems ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
