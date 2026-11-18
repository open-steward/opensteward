/**
 * Refrens order transform.
 *
 * Refrens does not document a dedicated order endpoint. This file is present
 * for interface completeness; the adapter does not implement listOrders /
 * getOrder / createOrder.
 */

import type { Order } from '../../../schema/order'

// Placeholder shape
export interface RefrensOrder {
  _id: string
  [key: string]: unknown
}

export function transformOrder(raw: RefrensOrder): Order {
  return {
    id: raw._id,
    metadata: raw as Record<string, unknown>,
  }
}
