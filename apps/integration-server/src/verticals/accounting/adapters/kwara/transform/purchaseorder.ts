import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface KwaraPurchaseOrder {
  id: string
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: KwaraPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
