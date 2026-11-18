import type { Order } from '../../../schema/order'

export interface SageOrder {
  id: string
  [key: string]: unknown
}

export function transformOrder(raw: SageOrder): Order {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
