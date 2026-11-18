/**
 * eGestor does not expose a purchase-order resource distinct from compras.
 * This file is intentionally minimal — EgestorAdapter does not implement
 * listPurchaseOrders / getPurchaseOrder.
 */
import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface EgestorPurchaseOrderStub {
  [key: string]: unknown
}

export function transformPurchaseOrder(_raw: EgestorPurchaseOrderStub): PurchaseOrder {
  return { metadata: _raw as Record<string, unknown> }
}
