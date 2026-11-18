import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FikenCreditMemoLine {
  netPrice: number
  vatAmount: number
  grossPrice: number
  description: string
  accountCode: string
  [key: string]: unknown
}

export interface FikenCreditMemo {
  creditNoteId: number
  creditNoteNumber: string
  customerId: number
  currency: string
  net: number
  vat: number
  gross: number
  issueDate: string
  settled: boolean
  lines: FikenCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(cm: FikenCreditMemo): CreditMemoStatus {
  if (cm.settled) return 'PAID'
  return 'AUTHORIZED'
}

function mapLineitem(row: FikenCreditMemoLine): Lineitem {
  return {
    itemDescription: row.description || undefined,
    totalAmount: row.grossPrice,
    taxAmount: row.vatAmount || undefined,
    accountId: row.accountCode || undefined,
  }
}

export function transformCreditMemo(raw: FikenCreditMemo): CreditMemo {
  return {
    id: String(raw.creditNoteId),
    status: mapStatus(raw),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
