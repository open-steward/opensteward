import type { SalesOrder } from '../../../schema/salesorder'

export interface KwaraSalesOrder {
  id: string
  [key: string]: unknown
}

export function transformSalesOrder(raw: KwaraSalesOrder): SalesOrder {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
