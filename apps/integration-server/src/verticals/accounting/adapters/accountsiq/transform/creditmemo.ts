import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AccountsIQCreditMemoLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface AccountsIQCreditMemo {
  creditNoteId: string | number
  entityId: string | number
  status: string
  creditNoteNumber: string
  creditNoteDate: string
  totalAmount: number
  taxAmount: number
  currency: string
  contactId: string | number
  lines: AccountsIQCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Posted':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AccountsIQCreditMemoLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformCreditMemo(raw: AccountsIQCreditMemo): CreditMemo {
  return {
    id: String(raw.creditNoteId),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.creditNoteDate ? new Date(raw.creditNoteDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
