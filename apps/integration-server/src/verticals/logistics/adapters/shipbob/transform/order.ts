import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, nonempty, parseDecimal } from '../../shared/transform'

export interface ShipBobRecipient {
  name: string | null
  email: string | null
  phone_number: string | null
  address: ShipBobAddress | null
}

export interface ShipBobAddress {
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  company_name: string | null
}

export interface ShipBobOrderProduct {
  id: number
  reference_id: string | null
  name: string | null
  sku: string | null
  quantity: number | null
  unit_price: number | null
  external_line_id: string | null
  gtin: string | null
  upc: string | null
  [key: string]: unknown
}

export interface ShipBobOrderShipment {
  id: number
  status: string | null
  /** Nested on the order-level summary exactly as on the detail route. The
   *  flat `tracking_number` below does not exist on 2026-01 and is kept only
   *  as a fallback for the older flat shape. */
  tracking?: {
    carrier?: string | null
    tracking_number?: string | null
    carrier_service?: string | null
    tracking_url?: string | null
  } | null
  tracking_number: string | null
  [key: string]: unknown
}

export interface ShipBobOrder {
  id: number
  reference_id: string | null
  order_number: string | null
  status: string | null
  created_date: string | null
  purchase_date: string | null
  channel: { id: number; name: string } | null
  recipient: ShipBobRecipient | null
  products: ShipBobOrderProduct[] | null
  shipments: ShipBobOrderShipment[] | null
  financials: { total_price: number | null } | null
  shipping_method: string | null
  gift_message: string | null
  tags: Array<{ name: string; value: string }> | null
  type: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'Processing':          return 'PROCESSING'
    case 'Exception':           return 'ON_HOLD'
    case 'OnHold':              return 'ON_HOLD'
    case 'On Hold':             return 'ON_HOLD'
    case 'PartiallyFulfilled':  return 'SHIPPED'
    case 'Partially Fulfilled': return 'SHIPPED'
    case 'Completed':           return 'DELIVERED'
    case 'Fulfilled':           return 'DELIVERED'
    case 'Cancelled':           return 'CANCELLED'
    case 'ImportReview':        return 'PENDING'
    default:                    return 'PENDING'
  }
}

function toCanonicalAddress(recipient: ShipBobRecipient | null) {
  if (!recipient) return undefined
  const addr = recipient.address
  const hasAny = recipient.name || addr?.address1 || addr?.city
  if (!hasAny) return undefined
  return {
    name: recipient.name ?? undefined,
    company: addr?.company_name ?? undefined,
    street1: addr?.address1 ?? undefined,
    street2: addr?.address2 ?? undefined,
    city: addr?.city ?? undefined,
    state: addr?.state ?? undefined,
    postalCode: addr?.zip_code ?? undefined,
    country: addr?.country ?? undefined,
    phone: recipient.phone_number ?? undefined,
    email: recipient.email ?? undefined,
  }
}

export function transformOrder(raw: ShipBobOrder): Order {
  const shipmentIds = nonempty(
    (raw.shipments ?? []).map((s) => String(s.id)),
  )

  const lineItems = (raw.products ?? []).map((p) => ({
    id: p.external_line_id ?? String(p.id),
    sku: p.sku ?? undefined,
    name: p.name ?? undefined,
    quantity: p.quantity ?? undefined,
    unitAmount: parseDecimal(p.unit_price),
  }))

  return {
    id: String(raw.id),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? raw.reference_id ?? undefined,
    destinationAddress: toCanonicalAddress(raw.recipient),
    shipmentIds,
    lineItems: nonempty(lineItems),
    totalAmount: parseDecimal(raw.financials?.total_price),
    requestedServiceCode: raw.shipping_method ?? undefined,
    notes: raw.gift_message ?? undefined,
    orderAt: toISODate(raw.purchase_date),
    createdAt: toISODate(raw.created_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
