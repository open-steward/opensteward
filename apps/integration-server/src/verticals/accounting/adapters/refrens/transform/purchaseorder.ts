/**
 * Refrens purchase-order transform.
 *
 * Refrens does not document a dedicated purchase-order endpoint. This file
 * is present for interface completeness; the adapter does not implement
 * listPurchaseOrders / getPurchaseOrder / createPurchaseOrder.
 */

import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Placeholder shape
export interface RefrensPurchaseOrder {
  _id: string
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: RefrensPurchaseOrder): PurchaseOrder {
  return {
    id: raw._id,
    metadata: raw as Record<string, unknown>,
  }
}
