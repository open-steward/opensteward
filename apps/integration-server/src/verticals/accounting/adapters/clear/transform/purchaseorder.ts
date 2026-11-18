import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Clear does not support purchase orders natively.
// This interface and transform are stubs for potential future API support.
export interface ClearPurchaseOrder {
  id: string
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: ClearPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
