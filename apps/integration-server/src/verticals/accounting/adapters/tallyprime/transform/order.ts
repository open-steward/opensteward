/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Order, OrderStatus } from '../../../schema/order'
import { parseTallyDate } from './shared'

export interface TallyOrder {
  VOUCHERNUMBER: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  ORDERSTATUS?: string
  [key: string]: unknown
}

function mapStatus(raw: TallyOrder): OrderStatus {
  return raw.ORDERSTATUS === 'Closed' ? 'COMPLETED' : 'ACTIVE'
}

export function transformOrder(raw: TallyOrder): Order {
  const totalAmount = parseFloat(raw.AMOUNT)
  const postedAt = parseTallyDate(raw.DATE)

  return {
    id: raw.VOUCHERNUMBER,
    type: 'SALES',
    status: mapStatus(raw),
    contactId: raw.PARTYLEDGERNAME || undefined,
    totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
