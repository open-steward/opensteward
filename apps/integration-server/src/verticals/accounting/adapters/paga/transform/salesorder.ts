import type { SalesOrder } from '../../../schema/salesorder'

// Paga does not expose sales order endpoints.
export interface PagaStubSalesOrder {
  [key: string]: unknown
}

export function transformSalesOrder(raw: PagaStubSalesOrder): SalesOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
