import { majorToMinor } from '@opensteward/shared'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'

/**
 * One entry of `orders_info` from `GET /v4/orders` (Queries API):
 * https://docs.envia.com/reference/get-orders.md
 *
 * Only fields that page documents, in its "Order object" / "Package object" /
 * "Shipment object" tables or its example response, are declared here.
 */
export interface EnviaOrderAddress {
  id?: string | number | null
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  country_code?: string | null
  state_code?: string | null
  city_select?: string | null
  postal_code?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface EnviaOrderProduct {
  id?: string | number | null
  name?: string | null
  sku?: string | null
  price?: number | null
  quantity?: number | null
  [key: string]: unknown
}

export interface EnviaOrderPackage {
  id?: number | null
  shipment?: { tracking_number?: string | null; [key: string]: unknown } | null
  products?: EnviaOrderProduct[] | null
  [key: string]: unknown
}

export interface EnviaOrderLocation extends EnviaOrderAddress {
  packages?: EnviaOrderPackage[] | null
}

export interface EnviaOrder {
  id?: number | null
  status_id?: number | null
  status_name?: string | null
  created_at_ecommerce?: string | null
  order?: {
    identifier?: string | null
    name?: string | null
    number?: string | null
    total_price?: number | null
    discount?: number | null
    subtotal?: number | null
    currency?: string | null
    [key: string]: unknown
  } | null
  shipment_data?: {
    shipping_address?: EnviaOrderAddress | null
    locations?: EnviaOrderLocation[] | null
  } | null
  [key: string]: unknown
}

/**
 * `status_id` catalog ("order workflow status") from the Get Orders page:
 * 1 Payment Pending, 2 Label Pending, 3 Pickup Pending, 4 Shipped,
 * 5 Canceled, 6 Other, 7 Completed ("All packages fulfilled").
 * "Other" and "Completed" have no canonical equivalent.
 */
const STATUS_BY_ID: Record<number, OrderStatus> = {
  1: 'PENDING',
  2: 'AWAITING_SHIPMENT',
  3: 'AWAITING_SHIPMENT',
  4: 'SHIPPED',
  5: 'CANCELLED',
}

function mapOrderStatus(id: number | null | undefined): OrderStatus {
  if (id == null) return 'unknown'
  return STATUS_BY_ID[id] ?? 'unknown'
}

const ISO_COUNTRY = /^[A-Z]{2}$/
const ISO_CURRENCY = /^[A-Z]{3}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
}

function toAddress(raw: EnviaOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const name = [raw.first_name, raw.last_name].filter((p) => p).join(' ')
  const addr: Address = {
    name: name || undefined,
    street1: str(raw.address_1),
    city: str(raw.city_select),
    state: str(raw.state_code),
    postalCode: str(raw.postal_code),
    country: raw.country_code && ISO_COUNTRY.test(raw.country_code) ? raw.country_code : undefined,
    email: raw.email && EMAIL.test(raw.email) ? raw.email : undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

export function transformOrder(raw: EnviaOrder): Order {
  const o = raw.order ?? {}
  const currency = o.currency && ISO_CURRENCY.test(o.currency) ? o.currency : undefined
  // Amounts are published only with the currency they are in.
  const money = (v: number | null | undefined): number | undefined =>
    currency ? majorToMinor(v, currency) : undefined

  const locations = raw.shipment_data?.locations ?? []
  const packages = locations.flatMap((l) => l.packages ?? [])
  const trackingNumbers = packages.flatMap((p) =>
    p.shipment?.tracking_number ? [p.shipment.tracking_number] : [],
  )
  const lineItems: Lineitem[] = packages.flatMap((p) =>
    (p.products ?? []).map((pr) => ({
      id: str(pr.id),
      sku: str(pr.sku),
      name: str(pr.name),
      quantity:
        typeof pr.quantity === 'number' && Number.isInteger(pr.quantity) && pr.quantity >= 0
          ? pr.quantity
          : undefined,
      unitAmount: money(pr.price),
    })),
  )

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapOrderStatus(raw.status_id),
    orderNumber: str(o.number),
    // An order ships from several origin locations; only a single one is an origin address.
    originAddress: locations.length === 1 ? toAddress(locations[0]) : undefined,
    destinationAddress: toAddress(raw.shipment_data?.shipping_address),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency,
    subtotalAmount: money(o.subtotal),
    discountAmount: money(o.discount),
    totalAmount: money(o.total_price),
    shipmentIds: trackingNumbers.length > 0 ? trackingNumbers : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
