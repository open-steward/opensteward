import type { PurchaseOrder } from '../../../schema/purchaseorder'

// freee does not natively support purchase orders.
// This module is a stub; the adapter does not implement listPurchaseOrders / getPurchaseOrder.

export interface FreeeStubPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(_raw: FreeeStubPurchaseOrder): PurchaseOrder {
  return {
    metadata: _raw as Record<string, unknown>,
  }
}
