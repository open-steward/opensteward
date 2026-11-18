import type { Order } from '../../../schema/order'

// Mazuma does not expose order endpoints.
export interface MazumaStubOrder {
  [key: string]: unknown
}

export function transformOrder(raw: MazumaStubOrder): Order {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
