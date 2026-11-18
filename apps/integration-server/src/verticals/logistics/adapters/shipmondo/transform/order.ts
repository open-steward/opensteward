import type { Order, OrderStatus } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Shipmondo raw types ─────────────────────────────────────────────────────

export interface ShipmondoOrderShipTo {
  name?: string | null
  attention?: string | null
  address1?: string | null
  address2?: string | null
  zipcode?: string | null
  city?: string | null
  country_code?: string | null
  email?: string | null
  mobile?: string | null
  telephone?: string | null
  [key: string]: unknown
}

export interface ShipmondoOrderLine {
  id?: number | null
  line_type?: string | null
  item_sku?: string | null
  item_name?: string | null
  quantity?: string | null
  unit_price_excluding_vat?: string | null
  amount_excluding_vat?: string | null
  amount_including_vat?: string | null
  currency_code?: string | null
  unit_weight?: number | null
  [key: string]: unknown
}

export interface ShipmondoOrderFulfillment {
  id?: number | null
  shipment_id?: number | null
  [key: string]: unknown
}

export interface ShipmondoSalesOrder {
  id?: number | null
  order_id?: string | null
  reference?: string | null
  ordered_at?: string | null
  order_status?: string | null
  fulfillment_status?: string | null
  order_note?: string | null
  carrier_code?: string | null
  ship_to?: ShipmondoOrderShipTo | null
  bill_to?: ShipmondoOrderShipTo | null
  order_lines?: ShipmondoOrderLine[] | null
  order_fulfillments?: ShipmondoOrderFulfillment[] | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PENDING'
  switch (status.toLowerCase()) {
    case 'open':
      return 'PENDING'
    case 'processing':
    case 'packed':
      return 'PROCESSING'
    case 'on_hold':
      return 'ON_HOLD'
    case 'sent':
    case 'picked_up':
      return 'SHIPPED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

// ─── Address mapping ─────────────────────────────────────────────────────────

function mapAddress(raw: ShipmondoOrderShipTo | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? raw.attention ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.zipcode ?? undefined,
    country: (raw.country_code as string | undefined) ?? undefined,
    email: raw.email ?? undefined,
    phone: raw.mobile ?? raw.telephone ?? undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

// ─── Line-item mapping ───────────────────────────────────────────────────────

function mapLineitems(lines: ShipmondoOrderLine[] | null | undefined): Lineitem[] | undefined {
  if (!lines || lines.length === 0) return undefined
  return lines
    .filter((l) => l.line_type !== 'shipping')
    .map((l) => ({
      id: l.id != null ? String(l.id) : undefined,
      sku: l.item_sku ?? undefined,
      name: l.item_name ?? undefined,
      quantity: l.quantity != null ? parseInt(l.quantity, 10) : undefined,
      unitAmount: l.unit_price_excluding_vat != null
        ? parseDecimal(l.unit_price_excluding_vat)
        : undefined,
      totalAmount: l.amount_including_vat != null
        ? parseDecimal(l.amount_including_vat)
        : undefined,
    }))
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: ShipmondoSalesOrder): Order {
  const shipmentIds = (raw.order_fulfillments ?? [])
    .filter((f) => f.shipment_id != null)
    .map((f) => String(f.shipment_id))

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    orderNumber: raw.order_id ?? undefined,
    status: mapOrderStatus(raw.order_status),
    destinationAddress: mapAddress(raw.ship_to),
    lineItems: mapLineitems(raw.order_lines),
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    notes: raw.order_note ?? undefined,
    requestedServiceCode: raw.carrier_code ?? undefined,
    orderAt: toISODate(raw.ordered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
