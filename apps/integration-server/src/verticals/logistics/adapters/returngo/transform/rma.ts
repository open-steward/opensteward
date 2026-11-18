import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

// ─── Raw API types ────────────────────────────────────────────────────────────

export interface ReturnGoAddress {
  full_name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface ReturnGoRmaLineItem {
  id?: string | number | null
  title?: string | null
  name?: string | null
  sku?: string | null
  quantity?: number | null
  price?: number | null
  currency?: string | null
  [key: string]: unknown
}

export interface ReturnGoShipment {
  tracking_number?: string | null
  carrier?: string | null
  service?: string | null
  label_url?: string | null
  label_cost?: number | null
  status?: string | null
  [key: string]: unknown
}

/**
 * ReturnGO RMA (Return Merchandise Authorization) — the core return record.
 */
export interface ReturnGoRma {
  id?: string | number | null
  rma_number?: string | null
  status?: string | null
  return_status?: string | null
  created_at?: string | null
  updated_at?: string | null

  // Order reference
  order_id?: string | number | null
  order_name?: string | null
  order_number?: string | null
  external_order_id?: string | number | null

  // Addresses
  customer_address?: ReturnGoAddress | null
  return_address?: ReturnGoAddress | null

  // Shipment/label
  shipment?: ReturnGoShipment | null
  tracking_number?: string | null
  carrier?: string | null
  label_url?: string | null

  // Financial
  currency?: string | null
  refund_amount?: number | null
  total_amount?: number | null
  subtotal_amount?: number | null
  tax_amount?: number | null
  shipping_amount?: number | null

  // Items
  items?: ReturnGoRmaLineItem[] | null
  line_items?: ReturnGoRmaLineItem[] | null

  [key: string]: unknown
}

// ─── Status mappers ───────────────────────────────────────────────────────────

function mapRmaStatusToShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('pending') || s.includes('submitted')) return 'PENDING'
  if (s.includes('label') && s.includes('created')) return 'LABEL_CREATED'
  if (s.includes('transit') || s.includes('shipped') || s.includes('in_transit'))
    return 'IN_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (
    s.includes('received') ||
    s.includes('arrived') ||
    s.includes('delivered') ||
    s.includes('complete')
  )
    return 'DELIVERED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('exception') || s.includes('failed') || s.includes('rejected')) return 'EXCEPTION'
  if (s.includes('return')) return 'RETURNED'
  return 'UNKNOWN'
}

function mapRmaStatusToOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'unknown'
  const s = status.toLowerCase()
  if (s.includes('pending') || s.includes('submitted') || s.includes('open')) return 'PENDING'
  if (s.includes('approved') || s.includes('processing')) return 'PROCESSING'
  if (s.includes('hold')) return 'ON_HOLD'
  if (s.includes('label') || s.includes('awaiting')) return 'AWAITING_SHIPMENT'
  if (s.includes('shipped') || s.includes('transit')) return 'SHIPPED'
  if (s.includes('received') || s.includes('delivered') || s.includes('complete')) return 'RETURNED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('returned')) return 'RETURNED'
  return 'unknown'
}

// ─── Transforms ──────────────────────────────────────────────────────────────

/**
 * Transform a ReturnGO RMA into a canonical Shipment.
 * ReturnGO is a reverse-logistics returns platform — each RMA represents
 * an inbound return shipment traveling from the customer to the merchant.
 */
export function transformRmaToShipment(raw: ReturnGoRma): Shipment {
  const effectiveStatus = raw.return_status ?? raw.status
  const trackingNumber = raw.tracking_number ?? raw.shipment?.tracking_number ?? undefined
  const carrierId = raw.carrier ?? raw.shipment?.carrier ?? undefined
  const labelUrl = raw.label_url ?? raw.shipment?.label_url ?? undefined
  const labelCost = raw.shipment?.label_cost ?? undefined

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapRmaStatusToShipmentStatus(raw.shipment?.status ?? effectiveStatus),
    trackingNumber: trackingNumber ?? undefined,
    carrierId: carrierId ?? undefined,
    serviceCode: raw.shipment?.service ?? undefined,
    originAddress: toAddress(raw.customer_address as Record<string, unknown> | null | undefined),
    destinationAddress: toAddress(raw.return_address as Record<string, unknown> | null | undefined),
    labelUrl: labelUrl ?? undefined,
    cost:
      labelCost != null && raw.currency
        ? { amount: Math.round(labelCost * 100), currency: raw.currency }
        : undefined,
    reference: raw.order_name ?? raw.order_number ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a ReturnGO RMA into a canonical Order.
 * RMAs carry order-level data (line items, amounts, status) that maps
 * naturally to the Order schema.
 */
export function transformRmaToOrder(raw: ReturnGoRma): Order {
  const effectiveStatus = raw.return_status ?? raw.status
  const rawItems = raw.items ?? raw.line_items ?? []

  const lineItems = rawItems.map((li) => ({
    id: li.id != null ? String(li.id) : undefined,
    name: li.title ?? li.name ?? undefined,
    sku: li.sku ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.price != null ? Math.round(li.price * 100) : undefined,
    totalAmount:
      li.price != null && li.quantity != null
        ? Math.round(li.price * li.quantity * 100)
        : undefined,
  }))

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapRmaStatusToOrderStatus(effectiveStatus),
    orderNumber: raw.order_number ?? raw.order_name ?? raw.rma_number ?? undefined,
    customerId: undefined,
    originAddress: toAddress(raw.customer_address as Record<string, unknown> | null | undefined),
    destinationAddress: toAddress(raw.return_address as Record<string, unknown> | null | undefined),
    currency: raw.currency ?? undefined,
    subtotalAmount: raw.subtotal_amount ?? undefined,
    taxAmount: raw.tax_amount ?? undefined,
    shippingAmount: raw.shipping_amount ?? undefined,
    totalAmount: raw.total_amount ?? raw.refund_amount ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
