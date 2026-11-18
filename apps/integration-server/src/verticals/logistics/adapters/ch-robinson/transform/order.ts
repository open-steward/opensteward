/**
 * C.H. Robinson order → canonical Order.
 *
 * C.H. Robinson (Navisphere) exposes order management via the Navisphere
 * Carrier API. Orders represent freight booking requests and are addressed
 * at /orders/{id}. Shipments are created from orders.
 *
 * Docs: https://developer.chrobinson.com/
 */

import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface CHROrderResponse {
  orderId?: string
  orderNumber?: string
  status?: string
  customerId?: string
  warehouseId?: string
  currency?: string
  totalAmount?: number
  shippingAmount?: number
  notes?: string
  requestedServiceCode?: string
  orderAt?: string
  shippedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, OrderStatus> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  ON_HOLD: 'ON_HOLD',
  AWAITING_SHIPMENT: 'AWAITING_SHIPMENT',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  RETURNED: 'RETURNED',
}

function mapStatus(raw: string | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toUpperCase()] ?? undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: CHROrderResponse): Order {
  return {
    id: raw.orderId ?? undefined,
    orderNumber: raw.orderNumber ?? undefined,
    status: mapStatus(raw.status),
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    currency: (raw.currency as Order['currency']) ?? undefined,
    totalAmount: raw.totalAmount ?? undefined,
    shippingAmount: raw.shippingAmount ?? undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.requestedServiceCode ?? undefined,
    orderAt: toISODate(raw.orderAt) ? new Date(raw.orderAt as string) : undefined,
    shippedAt: toISODate(raw.shippedAt) ? new Date(raw.shippedAt as string) : undefined,
    deliveredAt: toISODate(raw.deliveredAt) ? new Date(raw.deliveredAt as string) : undefined,
    cancelledAt: toISODate(raw.cancelledAt) ? new Date(raw.cancelledAt as string) : undefined,
    createdAt: toISODate(raw.createdAt) ? new Date(raw.createdAt as string) : undefined,
    updatedAt: toISODate(raw.updatedAt) ? new Date(raw.updatedAt as string) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
