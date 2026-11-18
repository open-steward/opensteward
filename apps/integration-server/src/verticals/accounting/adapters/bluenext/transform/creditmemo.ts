import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface BluenextCreditMemoLine {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  vatAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface BluenextCreditMemo {
  id: string
  documentNumber: string
  documentDate: string
  expiryDate: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  openAmount: number
  documentStatus: string
  currency: string
  customerId: string
  lines?: BluenextCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'confirmed': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: BluenextCreditMemoLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalAmount,
    taxAmount: row.vatAmount,
  }
}

export function transformCreditMemo(raw: BluenextCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    creditmemoNumber: raw.documentNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.expiryDate ? new Date(raw.expiryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
