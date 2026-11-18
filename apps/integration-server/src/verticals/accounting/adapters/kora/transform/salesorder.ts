import type { SalesOrder } from '../../../schema/salesorder'

// Kora does not expose sales order endpoints.
export interface KoraStubSalesOrder {
  [key: string]: unknown
}

export function transformSalesOrder(raw: KoraStubSalesOrder): SalesOrder {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
