/**
 * Yuki does not expose orders via its standard SOAP API.
 * This file is retained as a placeholder; the adapter does not implement
 * order operations — they auto-501 via the framework default.
 */

import type { Order } from '../../../schema/order'

export interface YukiOrder {
  [key: string]: unknown
}

export function transformOrder(_raw: YukiOrder): Order {
  throw new Error('Yuki: order endpoint is not available in the SOAP API')
}
