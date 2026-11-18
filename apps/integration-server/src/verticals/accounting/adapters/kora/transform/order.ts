import type { Order } from '../../../schema/order'

// Kora does not expose order endpoints.
export interface KoraStubOrder {
  [key: string]: unknown
}

export function transformOrder(raw: KoraStubOrder): Order {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
