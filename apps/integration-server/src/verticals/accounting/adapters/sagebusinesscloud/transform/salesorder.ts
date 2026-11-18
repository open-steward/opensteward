import type { SalesOrder } from '../../../schema/salesorder'

export interface SageSalesOrder {
  id: string
  [key: string]: unknown
}

export function transformSalesOrder(raw: SageSalesOrder): SalesOrder {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
