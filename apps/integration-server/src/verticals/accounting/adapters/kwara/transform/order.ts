import type { Order } from '../../../schema/order'

export interface KwaraOrder {
  id: string
  [key: string]: unknown
}

export function transformOrder(raw: KwaraOrder): Order {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
