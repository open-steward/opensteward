import type { Order } from '../../../schema/order'

export interface SmaccOrder {
  id: string
  [key: string]: unknown
}

// Smacc does not expose an orders resource via its public API.
export function transformOrder(raw: SmaccOrder): Order {
  return {
    id: String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
