import { majorToMinor } from '@opensteward/shared'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'

/**
 * Starshipit orders, from GET /api/orders ("Get Order(s)",
 * https://api-docs.starshipit.com/).
 *
 * The endpoint answers in two shapes:
 *
 *   - by `order_id` / `order_number`: `{ order: <Full Order Model>, success }`
 *     (documented "Get Order Response": "order | object list | List of order
 *     details (Full Order Model)");
 *   - without either, "this endpoint can be used to return multiple orders
 *     that match the criteria": `{ page_number, page_size, total_pages,
 *     total_records, data: { orders: [...] } }` (the documented "Get Printed
 *     Orders w/ Shipping Price" example), whose rows are a summary carrying
 *     `order_status` rather than `status`.
 *
 * Each shape has its own transform and reads only the fields its documented
 * model or example names.
 */

/** Sender Details Model / Destination Details Model (the fields read here). */
export interface StarshipitOrderAddress {
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  street?: string | null
  suburb?: string | null
  state?: string | null
  post_code?: string | null
  /** "The country name of delivery address" — a NAME ("Australia"), not ISO 3166. */
  country?: string | null
  [key: string]: unknown
}

/** Full Item Model (the fields read here). */
export interface StarshipitOrderItem {
  item_id?: number | null
  description?: string | null
  sku?: string | null
  quantity?: number | null
  /** "Unit weight of the product in kilograms (kg)" */
  weight?: number | null
  /** "Unit price of the product" */
  value?: number | null
  [key: string]: unknown
}

/** Full Order Model (the fields read here). */
export interface StarshipitOrder {
  order_id?: number | null
  order_date?: string | null
  order_number?: string | null
  carrier_service_code?: string | null
  /** "Currency code for the order value (e.g. AUD)" */
  currency?: string | null
  sender_details?: StarshipitOrderAddress | null
  destination?: StarshipitOrderAddress | null
  items?: StarshipitOrderItem[] | null
  /** "The order status. Unshipped, Saved, Printed or Delivered)" */
  status?: string | null
  [key: string]: unknown
}

/**
 * A row of the multi-order response's `data.orders` (the fields read here, all
 * named in the documented example). Its `contact_name` / `company_name` /
 * `state` carry no description saying whose address they are, so they stay in
 * metadata rather than being guessed into an address.
 */
export interface StarshipitOrderRow {
  order_id?: number | null
  order_status?: string | null
  order_number?: string | null
  order_date?: string | null
  carrier_service_code?: string | null
  currency?: string | null
  [key: string]: unknown
}

/**
 * Starshipit's order statuses: the Full Order Model's "Unshipped, Saved,
 * Printed or Delivered" and the `status` filter's "Unshipped, Shipped,
 * Printed". `Saved` has no documented meaning, so it maps to `unknown`.
 */
function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'unshipped':
    case 'printed':
      return 'AWAITING_SHIPMENT'
    case 'shipped':
      return 'SHIPPED'
    case 'delivered':
      return 'DELIVERED'
    default:
      return 'unknown'
  }
}

/**
 * `order_date`: "The date when the order was created in UTC". The documented
 * list example writes it without a zone designator
 * ("2025-07-08T23:29:42.3545569"), which `new Date` would read as local time,
 * so a zoneless value is read as the UTC the docs say it is.
 */
export function parseUtcDate(val: string | null | undefined): Date | undefined {
  if (!val) return undefined
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(val) ? val : `${val}Z`
  const d = new Date(zoned)
  return isNaN(d.getTime()) ? undefined : d
}

function str(v: string | null | undefined): string | undefined {
  return v == null || v === '' ? undefined : v
}

/** Country is a name in Starshipit's address models, so it is left out, never guessed. */
function transformOrderAddress(
  raw: StarshipitOrderAddress | null | undefined,
): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: str(raw.name),
    company: str(raw.company),
    street1: str(raw.street),
    city: str(raw.suburb),
    state: str(raw.state),
    postalCode: str(raw.post_code),
    phone: str(raw.phone),
    email: str(raw.email),
  }
  const defined = Object.entries(addr).filter(([, v]) => v !== undefined)
  return defined.length > 0 ? (Object.fromEntries(defined) as Address) : undefined
}

function transformItem(item: StarshipitOrderItem, currency: string | undefined): Lineitem {
  return {
    ...(item.item_id != null ? { id: String(item.item_id) } : {}),
    ...(str(item.sku) ? { sku: item.sku as string } : {}),
    ...(str(item.description) ? { name: item.description as string } : {}),
    ...(item.quantity != null ? { quantity: item.quantity } : {}),
    // A unit price is money only with the order's currency beside it.
    ...(item.value != null && currency ? { unitAmount: majorToMinor(item.value, currency) } : {}),
    ...(item.weight != null ? { weight: { value: item.weight, unit: 'kg' as const } } : {}),
  }
}

function requireId(id: number | null | undefined): string {
  if (id == null) throw new Error('Starshipit order has no order_id')
  return String(id)
}

/** Full Order Model → Order (Get Order by order_id / order_number). */
export function transformOrder(raw: StarshipitOrder): Order {
  const currency = str(raw.currency)
  const orderAt = parseUtcDate(raw.order_date)
  const lineItems = nonempty((raw.items ?? []).map((i) => transformItem(i, currency)))
  const origin = transformOrderAddress(raw.sender_details)
  const destination = transformOrderAddress(raw.destination)
  return {
    id: requireId(raw.order_id),
    status: mapOrderStatus(raw.status),
    ...(str(raw.order_number) ? { orderNumber: raw.order_number as string } : {}),
    ...(origin ? { originAddress: origin } : {}),
    ...(destination ? { destinationAddress: destination } : {}),
    ...(lineItems ? { lineItems } : {}),
    ...(currency ? { currency } : {}),
    ...(str(raw.carrier_service_code)
      ? { requestedServiceCode: raw.carrier_service_code as string }
      : {}),
    ...(orderAt ? { orderAt, createdAt: orderAt } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** A multi-order `data.orders` row → Order. */
export function transformOrderRow(raw: StarshipitOrderRow): Order {
  const orderAt = parseUtcDate(raw.order_date)
  return {
    id: requireId(raw.order_id),
    status: mapOrderStatus(raw.order_status),
    ...(str(raw.order_number) ? { orderNumber: raw.order_number as string } : {}),
    ...(str(raw.currency) ? { currency: raw.currency as string } : {}),
    ...(str(raw.carrier_service_code)
      ? { requestedServiceCode: raw.carrier_service_code as string }
      : {}),
    ...(orderAt ? { orderAt, createdAt: orderAt } : {}),
    metadata: raw as Record<string, unknown>,
  }
}
