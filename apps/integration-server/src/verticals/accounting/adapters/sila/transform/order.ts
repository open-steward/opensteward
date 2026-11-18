import type { Order } from '../../../schema/order'

// Sila does not expose order endpoints.
export interface SilaStubOrder {
  [key: string]: unknown
}

export function transformOrder(raw: SilaStubOrder): Order {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
