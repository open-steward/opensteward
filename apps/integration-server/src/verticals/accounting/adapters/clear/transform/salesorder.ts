import type { SalesOrder } from '../../../schema/salesorder'

// Clear does not support sales orders natively.
// This interface and transform are stubs for potential future API support.
export interface ClearSalesOrder {
  id: string
  [key: string]: unknown
}

export function transformSalesOrder(raw: ClearSalesOrder): SalesOrder {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
