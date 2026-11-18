/**
 * MineralTree purchase order → canonical PurchaseOrder transform.
 *
 * Endpoint: GET /mtapi/base/services/purchaseorder/{companyId}
 *
 * MineralTree PO states: New | Released | Received | PartiallyReceived |
 * FullyBilled | Cancelled | Closed
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from './money'

interface MtMoney {
  amount?: number
  currency?: string
}

interface MtPoLineItem {
  id?: string
  description?: string
  quantity?: number
  unitCost?: MtMoney
  amount?: MtMoney
  account?: { id?: string }
  item?: { id?: string; name?: string }
  [key: string]: unknown
}

export interface MtPurchaseOrder {
  id?: string
  externalId?: string
  poNumber?: string
  vendor?: { id?: string; name?: string }
  state?: string   // New | Released | Received | PartiallyReceived | FullyBilled | Cancelled | Closed
  poType?: string  // Standard | DropShip | Blanket | DropshipBlanket
  amount?: MtMoney
  dueDate?: string          // yyyy-MM-dd
  transactionDate?: string  // yyyy-MM-dd
  expenses?: MtPoLineItem[]
  items?: MtPoLineItem[]
  [key: string]: unknown
}

function mapStatus(state?: string): PurchaseOrderStatus {
  switch ((state ?? '').toLowerCase()) {
    case 'received':
    case 'fullybilled':
    case 'closed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'new':
    case 'released':
    case 'partiallyreceived':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineItem(li: MtPoLineItem): Lineitem {
  return {
    id: li.id || undefined,
    accountId: li.account?.id || undefined,
    itemId: li.item?.id || undefined,
    itemName: li.item?.name || undefined,
    itemDescription: li.description || undefined,
    unitAmount: toMinorUnits(li.unitCost?.amount),
    unitQuantity: li.quantity !== undefined ? Math.round(li.quantity) : undefined,
    totalAmount: toMinorUnits(li.amount?.amount),
  }
}

export function transformPurchaseOrder(raw: MtPurchaseOrder): PurchaseOrder {
  const lineItems = [
    ...(raw.expenses ?? []).map(mapLineItem),
    ...(raw.items ?? []).map(mapLineItem),
  ]
  return {
    id: raw.id || undefined,
    status: mapStatus(raw.state),
    contactId: raw.vendor?.id || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: toMinorUnits(raw.amount?.amount),
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.transactionDate
      ? new Date(raw.transactionDate)
      : raw.dueDate
        ? new Date(raw.dueDate)
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
