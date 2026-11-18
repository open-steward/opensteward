/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import { parseTallyDate } from './shared'

export interface TallySalesOrder {
  VOUCHERNUMBER: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  ORDERSTATUS?: string
  [key: string]: unknown
}

function mapStatus(raw: TallySalesOrder): SalesOrderStatus {
  return raw.ORDERSTATUS === 'Closed' ? 'COMPLETED' : 'ACTIVE'
}

export function transformSalesOrder(raw: TallySalesOrder): SalesOrder {
  const totalAmount = parseFloat(raw.AMOUNT)
  const postedAt = parseTallyDate(raw.DATE)

  return {
    id: raw.VOUCHERNUMBER,
    status: mapStatus(raw),
    contactId: raw.PARTYLEDGERNAME || undefined,
    totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
