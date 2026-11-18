import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// ─── Raw API types ────────────────────────────────────────────────────────────

export interface LoopReturnLineItem {
  id?: string | null
  title?: string | null
  sku?: string | null
  barcode?: string | null
  quantity?: number | null
  purchase_price?: number | null
  currency?: string | null
  [key: string]: unknown
}

export interface LoopReturnMethod {
  type?: string | null
  name?: string | null
  [key: string]: unknown
}

export interface LoopReturn {
  id: string | number
  state?: string | null
  outcome?: string | null
  created_at?: string | null
  updated_at?: string | null
  edited_at?: string | null

  // Order
  order_id?: string | number | null
  order_name?: string | null
  order_number?: string | null
  provider_order_id?: string | number | null
  provider_order_number?: string | null

  // Customer
  customer?: string | null
  origin_country?: string | null
  origin_country_code?: string | null

  // Shipping / tracking
  carrier?: string | null
  tracking_number?: string | null
  label_status?: string | null
  label_url?: string | null
  label_rate?: number | null
  label_updated_at?: string | null
  destination_id?: string | number | null
  status_page_url?: string | null
  package_reference?: string | null

  // Financial
  currency?: string | null
  total?: number | null
  refund?: number | null
  return_total?: number | null
  exchange_total?: number | null
  handling_fee?: number | null

  // Details
  type?: string | null
  return_method?: LoopReturnMethod | null
  line_items?: LoopReturnLineItem[] | null
  exchanges?: unknown[] | null
  labels?: unknown[] | null

  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapReturnStateToShipmentStatus(state: string | null | undefined): ShipmentStatus {
  switch (state) {
    case 'open':      return 'IN_TRANSIT'
    case 'closed':    return 'DELIVERED'
    case 'cancelled': return 'CANCELLED'
    case 'expired':   return 'EXCEPTION'
    case 'review':    return 'EXCEPTION'
    default:          return 'UNKNOWN'
  }
}

function mapLabelStatusToShipmentStatus(labelStatus: string | null | undefined): ShipmentStatus {
  switch (labelStatus) {
    case 'pending':   return 'PENDING'
    case 'created':   return 'LABEL_CREATED'
    case 'cancelled': return 'CANCELLED'
    default:          return 'UNKNOWN'
  }
}

function mapReturnStateToOrderStatus(state: string | null | undefined): OrderStatus {
  switch (state) {
    case 'open':      return 'RETURNED'
    case 'closed':    return 'RETURNED'
    case 'cancelled': return 'CANCELLED'
    case 'expired':   return 'CANCELLED'
    case 'review':    return 'ON_HOLD'
    default:          return 'unknown'
  }
}

// ─── Transforms ──────────────────────────────────────────────────────────────

/**
 * Transform a Loop Returns return record into a canonical Shipment.
 * Loop Returns is a reverse-logistics platform — each return IS a shipment
 * traveling from the customer back to the merchant's warehouse.
 */
export function transformReturnToShipment(raw: LoopReturn): Shipment {
  // Prefer tracking-derived status, fall back to return state
  const status: ShipmentStatus = raw.tracking_number
    ? mapReturnStateToShipmentStatus(raw.state)
    : raw.label_status
      ? mapLabelStatusToShipmentStatus(raw.label_status)
      : mapReturnStateToShipmentStatus(raw.state)

  return {
    id: String(raw.id),
    status,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.order_name ?? raw.order_number ?? undefined,
    cost:
      raw.label_rate != null && raw.currency
        ? { amount: raw.label_rate, currency: raw.currency }
        : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a Loop Returns return record into a canonical Order.
 * Loop Returns models return requests as order-like records with line items.
 */
export function transformReturnToOrder(raw: LoopReturn): Order {
  const lineItems = (raw.line_items ?? []).map((li) => ({
    id: li.id != null ? String(li.id) : undefined,
    name: li.title ?? undefined,
    sku: li.sku ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.purchase_price ?? undefined,
    totalAmount:
      li.purchase_price != null && li.quantity != null
        ? li.purchase_price * li.quantity
        : undefined,
  }))

  return {
    id: String(raw.id),
    status: mapReturnStateToOrderStatus(raw.state),
    orderNumber: raw.order_number ?? raw.order_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.return_total ?? raw.total ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

