import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface SmaccPurchaseOrder {
  id: string
  [key: string]: unknown
}

// Smacc does not expose a purchase orders resource via its public API.
export function transformPurchaseOrder(raw: SmaccPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
