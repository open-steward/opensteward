import type { Order } from '../../../schema/order'

export interface UhasibuOrder {
  id: string
  [key: string]: unknown
}

// Uhasibu does not expose an orders resource via its public API.
export function transformOrder(raw: UhasibuOrder): Order {
  return {
    id: String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
