import type { SalesOrder } from '../../../schema/salesorder'

export interface UhasibuSalesOrder {
  id: string
  [key: string]: unknown
}

// Uhasibu does not expose a sales orders resource via its public API.
export function transformSalesOrder(raw: UhasibuSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
