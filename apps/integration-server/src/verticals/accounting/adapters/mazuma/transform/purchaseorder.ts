import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Mazuma does not expose purchase order endpoints.
export interface MazumaStubPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: MazumaStubPurchaseOrder): PurchaseOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
