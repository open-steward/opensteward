import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Sila does not expose purchase order endpoints.
export interface SilaStubPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: SilaStubPurchaseOrder): PurchaseOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
