/**
 * eGestor does not expose a sales-order resource distinct from vendas.
 * This file is intentionally minimal — EgestorAdapter does not implement
 * listSalesOrders / getSalesOrder.
 */
import type { SalesOrder } from '../../../schema/salesorder'

export interface EgestorSalesOrderStub {
  [key: string]: unknown
}

export function transformSalesOrder(_raw: EgestorSalesOrderStub): SalesOrder {
  return { metadata: _raw as Record<string, unknown> }
}
