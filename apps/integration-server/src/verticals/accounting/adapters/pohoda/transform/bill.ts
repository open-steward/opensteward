/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface PohodaBillLine {
  id: string | number
  text?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface PohodaBill {
  id: string | number
  number?: string
  date?: string
  maturity?: string
  totalAmount?: number
  vatAmount?: number
  state?: number
  partnerId?: string | number
  currency?: string
  items?: PohodaBillLine[]
  [key: string]: unknown
}

function mapStatus(state?: number): BillStatus {
  switch (state) {
    case 3: return 'PAID'
    case 2: return 'AUTHORIZED'
    case 0: return 'VOIDED'
    case 1: default: return 'DRAFT'
  }
}

export function transformBill(raw: PohodaBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    billNumber: raw.number || undefined,
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.maturity ? new Date(raw.maturity) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.text || undefined,
      unitAmount: l.unitPrice,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
