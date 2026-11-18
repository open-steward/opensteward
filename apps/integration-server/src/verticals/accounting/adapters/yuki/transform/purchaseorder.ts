/**
 * Yuki does not expose purchase orders via its standard SOAP API.
 * This file is retained as a placeholder; the adapter does not implement
 * purchase order operations — they auto-501 via the framework default.
 */

import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface YukiPurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(_raw: YukiPurchaseOrder): PurchaseOrder {
  throw new Error('Yuki: purchase order endpoint is not available in the SOAP API')
}
