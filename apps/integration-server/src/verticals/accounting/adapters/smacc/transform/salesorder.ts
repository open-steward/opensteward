import type { SalesOrder } from '../../../schema/salesorder'

export interface SmaccSalesOrder {
  id: string
  [key: string]: unknown
}

// Smacc does not expose a sales orders resource via its public API.
export function transformSalesOrder(raw: SmaccSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
