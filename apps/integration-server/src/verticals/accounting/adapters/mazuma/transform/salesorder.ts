import type { SalesOrder } from '../../../schema/salesorder'

// Mazuma does not expose sales order endpoints.
export interface MazumaStubSalesOrder {
  [key: string]: unknown
}

export function transformSalesOrder(raw: MazumaStubSalesOrder): SalesOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
