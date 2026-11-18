/**
 * Oracle Transportation Management (OTM) Order → canonical Order.
 *
 * OTM transport orders are the top-level planning objects that carry
 * shipment requests. They expose origin/destination addresses, line
 * items (order releases), and status information.
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/transportation-management/
 */

import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

export interface OracleOtmOrderAddress {
  name?: string
  company?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface OracleOtmOrderLineitem {
  lineId?: string
  sku?: string
  description?: string
  name?: string
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  weight?: number
  weightUnit?: string
  [key: string]: unknown
}

export interface OracleOtmOrderResponse {
  id?: string
  orderId?: string
  orderNumber?: string
  status?: string
  customerId?: string
  clientId?: string
  warehouseId?: string
  shipmentIds?: string[]
  origin?: OracleOtmOrderAddress
  destination?: OracleOtmOrderAddress
  lineItems?: OracleOtmOrderLineitem[]
  items?: OracleOtmOrderLineitem[]
  currency?: string
  totalAmount?: number
  notes?: string
  serviceCode?: string
  orderDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapOrderStatus(raw: string | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase().replace(/[\s-]/g, '_')
  const map: Record<string, OrderStatus> = {
    PLANNED: 'PENDING',
    SUBMITTED: 'PENDING',
    OPEN: 'PROCESSING',
    IN_PROGRESS: 'PROCESSING',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CLOSED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    CANCELED: 'CANCELLED',
    ON_HOLD: 'ON_HOLD',
  }
  return map[upper] ?? undefined
}

function toOrderAddress(raw: OracleOtmOrderAddress | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    // toAddress checks raw.street1 / raw.address1 / raw.address_line1 / raw.line1
    street1: raw.address,
    address1: raw.address,
    street2: raw.address2,
    city: raw.city,
    state: raw.state,
    // toAddress checks raw.postalCode / raw.postal_code / raw.zip / raw.zip_code
    postalCode: raw.zipCode,
    zip: raw.zipCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  } as Record<string, unknown>)
}

export function transformOrder(raw: OracleOtmOrderResponse): Order {
  const id = raw.orderId ?? raw.id ?? undefined
  const lineItems = (raw.lineItems ?? raw.items ?? []).map((li) => ({
    id: li.lineId ?? undefined,
    sku: li.sku ?? undefined,
    name: li.name ?? li.description ?? undefined,
    description: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unitPrice != null ? Math.round(li.unitPrice * 100) : undefined,
    totalAmount: li.totalPrice != null ? Math.round(li.totalPrice * 100) : undefined,
    weight:
      li.weight != null
        ? {
            value: li.weight,
            unit: (li.weightUnit?.toLowerCase() === 'kg' ? 'kg' : 'lb') as 'kg' | 'lb',
          }
        : undefined,
  }))

  return {
    id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? raw.clientId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    shipmentIds: raw.shipmentIds ?? undefined,
    originAddress: toOrderAddress(raw.origin),
    destinationAddress: toOrderAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.totalAmount != null ? Math.round(raw.totalAmount * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.serviceCode ?? undefined,
    orderAt: toISODate(raw.orderDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
