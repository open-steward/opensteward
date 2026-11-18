/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface Unit4CreditMemoLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface Unit4CreditMemo {
  creditMemoId: string | number
  creditMemoNumber?: string
  status: string
  customerId?: string | number
  amount: number
  taxAmount?: number
  currencyCode?: string
  postingDate?: string
  companyId?: string | number
  lines?: Unit4CreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Approved':
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

function mapLineitem(line: Unit4CreditMemoLine): Lineitem {
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

export function transformCreditMemo(raw: Unit4CreditMemo): CreditMemo {
  return {
    id: String(raw.creditMemoId),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditMemoNumber || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.postingDate ? new Date(raw.postingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
