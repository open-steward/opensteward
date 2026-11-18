import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Money Forward does not support purchase orders.
// This module is a stub; the adapter does not implement listPurchaseOrders / getPurchaseOrder.

export interface MoneyForwardStubPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(_raw: MoneyForwardStubPurchaseOrder): PurchaseOrder {
  return {
    metadata: _raw as Record<string, unknown>,
  }
}
