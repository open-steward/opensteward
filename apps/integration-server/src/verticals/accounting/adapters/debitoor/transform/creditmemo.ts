/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface DebitoorCreditMemoRow {
  id: string
  productName: string
  unitNetPrice: number
  quantity: number
  netAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface DebitoorCreditMemo {
  id: string
  invoiceNumber: string
  date: string
  dueDate: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  outstandingAmount: number
  status: string
  customerId: string
  currency: string
  lines: DebitoorCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: DebitoorCreditMemoRow): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemDescription: row.productName || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
    taxAmount: row.taxAmount,
  }
}

export function transformCreditMemo(raw: DebitoorCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.outstandingAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
