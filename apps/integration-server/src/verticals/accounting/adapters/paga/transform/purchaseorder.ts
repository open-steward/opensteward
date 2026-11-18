import type { PurchaseOrder } from '../../../schema/purchaseorder'

// Paga does not expose purchase order endpoints.
export interface PagaStubPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: PagaStubPurchaseOrder): PurchaseOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
