import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface SagePurchaseOrder {
  id: string
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: SagePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
