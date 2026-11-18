/**
 * Soldo order → canonical Order.
 *
 * Soldo orders represent card and product issuance requests (e.g. physical card
 * fulfilment). They are NOT accounting purchase/sales orders.
 *
 * Endpoint: GET /business/v2/orders, GET /business/v2/orders/{orderId}
 *
 * Order fields:
 *   id, status (PENDING | ERROR | PLACED | CANCELLED | COMPLETED | COMPLETED_WITH_CREDIT),
 *   creation_time, last_update_time, error_code, total_paid_amount,
 *   total_paid_currency, items (array of OrderItem), is_valid
 */

import type { Order, OrderStatus } from '../../../schema/order'

export interface SoldoOrderItem {
  id?: string
  item_type?: string
  category?: string
  [key: string]: unknown
}

export interface SoldoOrder {
  id: string
  status?: string
  creation_time?: string
  last_update_time?: string
  error_code?: string
  total_paid_amount?: number
  total_paid_currency?: string
  items?: SoldoOrderItem[]
  is_valid?: boolean
  [key: string]: unknown
}

/**
 * Convert a Soldo major-unit decimal amount to canonical integer minor units.
 * Soldo returns amounts as decimals (e.g. 100.50 EUR). The canonical Amount
 * schema requires integer minor units (e.g. 10050 for €100.50).
 */
function toMinorUnits(amount: number | undefined | null): number | undefined {
  if (amount == null) return undefined
  return Math.round(amount * 100)
}

function mapOrderStatus(status?: string): OrderStatus {
  if (!status) return 'unknown'
  switch (status.toUpperCase()) {
    case 'PENDING':
    case 'PLACED':
      return 'ACTIVE'
    case 'COMPLETED':
    case 'COMPLETED_WITH_CREDIT':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'ERROR':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

export function transformOrder(raw: SoldoOrder): Order {
  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    type: 'PURCHASE',
    currency: raw.total_paid_currency ?? undefined,
    totalAmount: toMinorUnits(raw.total_paid_amount),
    postedAt: raw.creation_time ? new Date(raw.creation_time) : undefined,
    createdAt: raw.creation_time ? new Date(raw.creation_time) : undefined,
    updatedAt: raw.last_update_time ? new Date(raw.last_update_time) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
