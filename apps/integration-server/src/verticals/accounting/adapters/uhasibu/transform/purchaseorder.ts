import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface UhasibuPurchaseOrder {
  id: string
  [key: string]: unknown
}

// Uhasibu does not expose a purchase orders resource via its public API.
export function transformPurchaseOrder(raw: UhasibuPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
