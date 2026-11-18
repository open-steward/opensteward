/**
 * Yuki does not expose sales orders via its standard SOAP API.
 * This file is retained as a placeholder; the adapter does not implement
 * sales order operations — they auto-501 via the framework default.
 */

import type { SalesOrder } from '../../../schema/salesorder'

export interface YukiSalesOrder {
  [key: string]: unknown
}

export function transformSalesOrder(_raw: YukiSalesOrder): SalesOrder {
  throw new Error('Yuki: sales order endpoint is not available in the SOAP API')
}
