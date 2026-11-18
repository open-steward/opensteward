import type { Order } from '../../../schema/order'

// Paga does not expose order endpoints.
export interface PagaStubOrder {
  [key: string]: unknown
}

export function transformOrder(raw: PagaStubOrder): Order {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
