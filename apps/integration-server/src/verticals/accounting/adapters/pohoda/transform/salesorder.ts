/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface PohodaSalesOrderLine {
  id: string | number
  text?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface PohodaSalesOrder {
  id: string | number
  state?: number
  partnerId?: string | number
  currency?: string
  totalAmount?: number
  date?: string
  items?: PohodaSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(state?: number): SalesOrderStatus {
  switch (state) {
    case 2: return 'ACTIVE'
    case 3: return 'COMPLETED'
    case 0: return 'CANCELLED'
    case 1: default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: PohodaSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.text || undefined,
      unitAmount: l.unitPrice,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
