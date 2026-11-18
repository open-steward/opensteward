import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── Raw Transporeon delivery DTO shapes ───────────────────────────────────────

/**
 * Represents a single item within a Transporeon delivery order.
 * Maps to the canonical Lineitem shape.
 */
export interface TransporeonDeliveryItem {
  id?: string | number
  number?: string | number
  description?: string
  quantity?: number
  weight?: number
  weight_unit?: string
  [key: string]: unknown
}

/**
 * A Transporeon delivery DTO as returned by GET /v1/delivery.
 * Deliveries are shipper-created order entities that are grouped into
 * a transport assignment for the carrier.
 */
export interface TransporeonDeliveryDto {
  id?: string | number
  number?: string | number
  shipper_id?: string | number
  shipper_name?: string
  transport_id?: string | number
  status?: string
  qualifier?: string
  timestamp?: string
  reference?: string
  customer_name?: string
  comment_plain_text?: string
  currency_id?: string
  price_basic?: number | null
  // Origin / loading
  loading_company?: string
  loading_address?: string
  loading_zip?: string
  loading_city?: string
  loading_region?: string
  loading_country_id?: string
  loading_from_date?: string
  loading_from_time?: string
  // Destination / unloading
  unloading_company?: string
  unloading_address?: string
  unloading_zip?: string
  unloading_city?: string
  unloading_region?: string
  unloading_country_id?: string
  unloading_until_date?: string
  unloading_until_time?: string
  // Line items
  items?: TransporeonDeliveryItem[]
  pull_id?: string
  [key: string]: unknown
}

/** API list response for deliveries */
export interface TransporeonDeliveryListResponse {
  pull_id?: string
  delivery?: TransporeonDeliveryDto[]
  deliveries?: TransporeonDeliveryDto[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a Transporeon delivery qualifier or status string to the canonical
 * OrderStatus. Transporeon uses the same qualifier pattern as transports.
 */
function mapDeliveryStatus(qualifier: string | undefined, status: string | undefined): OrderStatus {
  const code = qualifier ?? status ?? ''
  const map: Record<string, OrderStatus> = {
    'tour.routed': 'AWAITING_SHIPMENT',
    'tour.accepted': 'PROCESSING',
    'tour.assign': 'PROCESSING',
    'tour.assigned.change': 'PROCESSING',
    'tour.assigned.cancelled': 'CANCELLED',
    'tour.tiflow.cancelled': 'CANCELLED',
    'tour.tiflow.modified': 'PROCESSING',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    PENDING: 'PENDING',
  }
  return map[code] ?? 'PENDING'
}

function buildDatetime(date?: string, time?: string): Date | undefined {
  if (!date) return undefined
  const dt = time ? `${date}T${time}` : date
  return toISODate(dt)
}

function toOriginAddress(raw: TransporeonDeliveryDto): Address | undefined {
  const hasAny =
    raw.loading_company ||
    raw.loading_address ||
    raw.loading_zip ||
    raw.loading_city ||
    raw.loading_country_id
  if (!hasAny) return undefined
  return {
    company: raw.loading_company ?? undefined,
    street1: raw.loading_address ?? undefined,
    city: raw.loading_city ?? undefined,
    state: raw.loading_region ?? undefined,
    postalCode: raw.loading_zip ?? undefined,
    country: raw.loading_country_id ?? undefined,
  }
}

function toDestinationAddress(raw: TransporeonDeliveryDto): Address | undefined {
  const hasAny =
    raw.unloading_company ||
    raw.unloading_address ||
    raw.unloading_zip ||
    raw.unloading_city ||
    raw.unloading_country_id
  if (!hasAny) return undefined
  return {
    company: raw.unloading_company ?? undefined,
    street1: raw.unloading_address ?? undefined,
    city: raw.unloading_city ?? undefined,
    state: raw.unloading_region ?? undefined,
    postalCode: raw.unloading_zip ?? undefined,
    country: raw.unloading_country_id ?? undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Transform a single Transporeon delivery DTO into the canonical Order shape.
 * A Transporeon delivery is a shipper-created order entity grouped under a
 * transport assignment; it maps naturally to the logistics Order resource.
 */
export function transformDelivery(raw: TransporeonDeliveryDto): Order {
  const id = raw.id !== undefined ? String(raw.id) : undefined

  const originAddress = toOriginAddress(raw)
  const destinationAddress = toDestinationAddress(raw)

  const shippedAt = buildDatetime(raw.loading_from_date, raw.loading_from_time)
  const deliveredAt = buildDatetime(raw.unloading_until_date, raw.unloading_until_time)
  const createdAt = toISODate(raw.timestamp) ?? new Date()

  const totalAmount =
    raw.price_basic != null && raw.price_basic > 0
      ? Math.round(raw.price_basic * 100)
      : undefined

  const shipmentIds =
    raw.transport_id != null ? [String(raw.transport_id)] : undefined

  const lineItems =
    raw.items && raw.items.length > 0
      ? raw.items.map((item) => ({
          id: item.id !== undefined ? String(item.id) : undefined,
          name: item.description ?? undefined,
          quantity: item.quantity ?? undefined,
        }))
      : undefined

  return {
    id,
    status: mapDeliveryStatus(raw.qualifier, raw.status),
    orderNumber: raw.number !== undefined ? String(raw.number) : undefined,
    customerId: raw.shipper_id !== undefined ? String(raw.shipper_id) : undefined,
    shipmentIds,
    originAddress,
    destinationAddress,
    lineItems,
    currency: raw.currency_id as string | undefined,
    totalAmount,
    notes: raw.comment_plain_text ?? undefined,
    shippedAt,
    deliveredAt,
    createdAt,
    updatedAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Extract the array of delivery DTOs from the API list response shape.
 * Transporeon uses either `delivery` or `deliveries` as the envelope key.
 */
export function extractDeliveries(
  res: TransporeonDeliveryListResponse,
): TransporeonDeliveryDto[] {
  return res.delivery ?? res.deliveries ?? []
}
