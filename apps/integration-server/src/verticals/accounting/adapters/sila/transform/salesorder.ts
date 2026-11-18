import type { SalesOrder } from '../../../schema/salesorder'

// Sila does not expose sales order endpoints.
export interface SilaStubSalesOrder {
  [key: string]: unknown
}

export function transformSalesOrder(raw: SilaStubSalesOrder): SalesOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
