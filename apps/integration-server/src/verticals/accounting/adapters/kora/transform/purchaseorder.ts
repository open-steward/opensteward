import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Kora does not expose purchase order endpoints.
export interface KoraStubPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: KoraStubPurchaseOrder): PurchaseOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
