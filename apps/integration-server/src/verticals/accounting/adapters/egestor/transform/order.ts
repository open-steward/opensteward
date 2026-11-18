/**
 * eGestor does not expose a generic "order" resource distinct from vendas or
 * compras. This file is intentionally minimal — EgestorAdapter does not
 * implement listOrders / getOrder.
 */
import type { Order } from '../../../schema/order'

export interface EgestorOrderStub {
  [key: string]: unknown
}

export function transformOrder(_raw: EgestorOrderStub): Order {
  return { metadata: _raw as Record<string, unknown> }
}
