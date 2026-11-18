import type { Order } from '../../../schema/order'

// Clear does not support orders natively.
// This interface and transform are stubs for potential future API support.
export interface ClearOrder {
  id: string
  [key: string]: unknown
}

export function transformOrder(raw: ClearOrder): Order {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
