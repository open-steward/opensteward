/**
 * Refrens sales-order transform.
 *
 * Refrens does not document a dedicated sales-order endpoint. This file is
 * present for interface completeness; the adapter does not implement
 * listSalesOrders / getSalesOrder / createSalesOrder.
 */

import type { SalesOrder } from '../../../schema/salesorder'

// Placeholder shape
export interface RefrensSalesOrder {
  _id: string
  [key: string]: unknown
}

export function transformSalesOrder(raw: RefrensSalesOrder): SalesOrder {
  return {
    id: raw._id,
    metadata: raw as Record<string, unknown>,
  }
}
