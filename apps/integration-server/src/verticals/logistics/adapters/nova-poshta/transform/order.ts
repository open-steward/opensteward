import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, parseDecimal } from '../../shared/transform'

/**
 * The shape createOrder reads back from POST /fulfillment/{countrycode}/orders.
 * NOT verified: that route predates Fulfillment v2.0 ("Single order creation
 * via `/orders` has been removed"), and these field names (`documentId`,
 * `waybilNumber`, string statuses) are the pre-v2.0 ones. listOrders and
 * getOrder read the documented shapes below instead.
 */
export interface NovaPoshtaFulfillmentOrder {
  /** Internal order identifier. */
  documentId?: string | null
  /** Client-supplied external order number. */
  externalNumber?: string | null
  /** Order status string, e.g. "Created", "Processing", "Shipped", "Delivered", "Cancelled". */
  status?: string | null
  statusTime?: string | null
  /** Destination warehouse identifier. */
  destWarehouse?: string | null
  /** Additional info / notes. */
  additionalInfo?: string | null
  /** Delivery type / service code. */
  deliveryType?: string | null
  /** TTN (waybill / tracking number) for the shipment created from this order. */
  waybilNumber?: string | null
  /** Line-items (goods) in this order. */
  details?: Array<{
    objectId?: string | null
    sku?: string | null
    measureUnitName?: string | null
    plannedQuantity?: number | null
    actualQuantity?: number | null
    quantity?: number | null
    price?: number | null
    sum?: number | null
    condition?: string | null
    series?: string | null
    [key: string]: unknown
  }> | null
  /** Pagination fields on the list response. */
  page?: number | null
  pages?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toLowerCase()) {
    case 'created':
    case 'new':
    case 'pending':
      return 'PENDING'
    case 'processing':
    case 'in_progress':
      return 'PROCESSING'
    case 'on_hold':
    case 'onhold':
      return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'awaiting shipment':
    case 'ready':
      return 'AWAITING_SHIPMENT'
    case 'shipped':
    case 'in_transit':
    case 'intransit':
    case 'dispatched':
      return 'SHIPPED'
    case 'delivered':
    case 'received':
      return 'DELIVERED'
    case 'cancelled':
    case 'canceled':
    case 'deleted':
      return 'CANCELLED'
    case 'returned':
    case 'return':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

export function transformOrder(raw: NovaPoshtaFulfillmentOrder): Order {
  const lineItems = (raw.details ?? [])
    .map((d) => ({
      id: d.objectId ?? undefined,
      sku: d.sku ?? undefined,
      name: d.measureUnitName ?? undefined,
      quantity: parseDecimal(d.plannedQuantity ?? d.actualQuantity ?? d.quantity),
      unitAmount: parseDecimal(d.price),
      totalAmount: parseDecimal(d.sum),
    }))
    .filter((li) => Object.values(li).some((v) => v !== undefined))

  const shipmentIds = raw.waybilNumber ? [raw.waybilNumber] : undefined

  return {
    id: raw.documentId ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.externalNumber ?? undefined,
    warehouseId: raw.destWarehouse ?? undefined,
    shipmentIds,
    requestedServiceCode: raw.deliveryType ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    notes: raw.additionalInfo ?? undefined,
    orderAt: toISODate(raw.statusTime ?? raw.createdAt),
    shippedAt:
      raw.status?.toLowerCase() === 'shipped' ? toISODate(raw.statusTime) : undefined,
    deliveredAt:
      raw.status?.toLowerCase() === 'delivered' ? toISODate(raw.statusTime) : undefined,
    cancelledAt:
      raw.status?.toLowerCase() === 'cancelled' || raw.status?.toLowerCase() === 'canceled'
        ? toISODate(raw.statusTime)
        : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Documented fulfillment shapes ────────────────────────────────────────────
// https://api-portal.novapost.com/methods/methods/fullfillment.md (OpenAPI
// embedded in the page). Only fields that spec names are read.

/**
 * One row of `data` in GET /fulfillment/{countrycode}/v1/orders/status
 * ("Check Order Status"). Required: id, externalNumber, destWarehouse, status.
 */
export interface NovaPoshtaOrderStatus {
  /** "Unique identifier of the order." */
  id: string
  /** "External order number." */
  externalNumber: string
  /** "Destination warehouse code." */
  destWarehouse: string
  /** "Current order status." Documented values: 1 (New), 13 (Incomplete), 10 (Canceled). */
  status: number
  /** "Timestamp of the latest status update." */
  statusTime?: string | null
  /** "Waybill number." */
  waybillNumber?: string | null
}

/** The GET /fulfillment/{countrycode}/v1/orders/status response. */
export interface NovaPoshtaOrderStatusPage {
  /** "List of orders." */
  data: NovaPoshtaOrderStatus[]
  /** "Pagination links." (no documented fields) */
  links?: Record<string, unknown>
  /** "Pagination metadata." (no documented fields) */
  meta?: Record<string, unknown>
}

/** GET /fulfillment/{countrycode}/v1/orders/{id}/details ("Get Order Details"). */
export interface NovaPoshtaOrderDetails {
  /** "Unique identifier of the order." */
  id: string
  /** "External order number." */
  externalNumber: string
  /** "List of order items." */
  details: Array<{
    /** "Unique identifier of the order item." */
    id: string
    /** "Product identifier." */
    objectId: string
    /** "Product SKU." */
    sku: string
    /** "Unit of measurement." */
    measureUnitName?: string
    /** "Planned quantity." */
    plannedQuantity: number
    /** "Actual quantity." */
    actualQuantity: number
    /** "Product condition." enum [0, 1] */
    condition: number
    /** "List of serial numbers." */
    series: string[]
  }>
}

/**
 * The order statuses fullfillment.md names. Create Orders: "each order is
 * created with one of the following statuses: - `1` **(New)** — when all
 * products are available in stock. - `13` **(Incomplete)** — when some
 * products are fully or partially unavailable." Cancel Order: "Once canceled,
 * the order transitions to status `10` **(Canceled)**." An Incomplete order
 * waits on its missing goods (Add Goods to Order, Update Order and Delete
 * Goods from Order act only on an order "in status `13` **(Incomplete)**"),
 * so it is ON_HOLD. Any other value is undocumented and maps to `unknown`.
 */
const ORDER_STATUS: Readonly<Record<number, Order['status']>> = {
  1: 'PENDING',
  13: 'ON_HOLD',
  10: 'CANCELLED',
}

/**
 * A Check Order Status row. `status` maps through ORDER_STATUS and the raw
 * value stays in metadata with `statusTime` and `waybillNumber` (a waybill
 * number is not the shipment id GET /shipments/{id} reads, so it is not a
 * `shipmentIds` entry). `destWarehouse` is a fulfillment warehouse code
 * ("Destination warehouse code.", e.g. "000063146"), not the Nova Post
 * division id getWarehouse reads (GET /divisions/{id}), so it stays in
 * metadata rather than `warehouseId`.
 */
export function transformOrderStatus(raw: NovaPoshtaOrderStatus): Order {
  return {
    id: raw.id,
    status: ORDER_STATUS[raw.status] ?? 'unknown',
    orderNumber: raw.externalNumber,
    metadata: {
      status: raw.status,
      statusTime: raw.statusTime ?? null,
      waybillNumber: raw.waybillNumber ?? null,
      destWarehouse: raw.destWarehouse,
    },
  }
}

/** A Get Order Details response: the order's items, ordered at `plannedQuantity`. */
export function transformOrderDetails(raw: NovaPoshtaOrderDetails): Order {
  const lineItems = raw.details.map((d) => ({
    id: d.id,
    sku: d.sku,
    quantity: d.plannedQuantity,
  }))
  return {
    id: raw.id,
    orderNumber: raw.externalNumber,
    ...(lineItems.length > 0 ? { lineItems } : {}),
    metadata: { details: raw.details },
  }
}
