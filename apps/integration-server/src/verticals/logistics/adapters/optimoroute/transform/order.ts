import type { Order } from '../../../schema/order'
import type { Address } from '../../../schema/shared'

/**
 * The Order Object of the OptimoRoute WS API (https://optimoroute.com/api/,
 * "Data Objects" → "Order Object"), as returned in `data` by
 * `POST /v1/get_orders` and by `POST /v1/search_orders` with
 * `includeOrderData: true`. Only the fields this transform reads are typed;
 * the rest ride on the index signature into `metadata`.
 *
 * The Order Object has no status field: status is only a search filter
 * (`orderStatus`) and a field of `get_completion_details`, so none is mapped.
 */
export interface OptimorouteOrderRecord {
  /** "The read-only unique identifier of the order, assigned by OptimoRoute." */
  id: string
  /** "A user specified order identifier, also displayed in the web application." */
  orderNo?: string | null
  /** "Order date. YYYY-MM-DD format, for example 2013-12-20." */
  date?: string | null
  /** "Delivery/Service location. See Location Object." */
  location?: {
    locationNo?: string | null
    locationName?: string | null
    /** "The full address including the country, for example 393 Hanover St, Boston, MA 02113, US" */
    address?: string | null
    [key: string]: unknown
  } | null
  /** "The optional note that will accompany the driver's instructions." */
  notes?: string | null
  /** "Customer phone number. Default empty." */
  phone?: string | null
  [key: string]: unknown
}

/**
 * One entry of `orders` in a `get_orders` or `search_orders` response:
 * "Order Response Object" — `id` ("mandatory"), `data` ("The retrieved order
 * data ; only present if includeOrderData was set to true").
 */
export interface OptimorouteOrderResponseObject {
  id: string
  success?: boolean
  code?: string
  message?: string
  data?: OptimorouteOrderRecord
}

/**
 * `POST /v1/search_orders` response: `success`, `orders` ("Up to 500 orders
 * will be returned in one call. Use after_tag to fetch the remaining pages.")
 * and `after_tag` ("Only present if the there are more pages of results to
 * fetch.").
 */
export interface OptimorouteSearchOrdersResponse {
  success: boolean
  orders?: OptimorouteOrderResponseObject[]
  after_tag?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** `date` is a calendar date with no zone, read as that UTC day. */
function orderDate(v: string | null | undefined): Date | undefined {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return undefined
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function destination(raw: OptimorouteOrderRecord): Address | undefined {
  const addr: Address = {}
  const street = text(raw.location?.address)
  const name = text(raw.location?.locationName)
  const phone = text(raw.phone)
  if (street) addr.street1 = street
  if (name) addr.name = name
  if (phone) addr.phone = phone
  return Object.keys(addr).length > 0 ? addr : undefined
}

export function transformOrder(raw: OptimorouteOrderRecord): Order {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('OptimoRoute order has no id')
  }
  const order: Order = {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
  const orderNumber = text(raw.orderNo)
  if (orderNumber) order.orderNumber = orderNumber
  const dest = destination(raw)
  if (dest) order.destinationAddress = dest
  const notes = text(raw.notes)
  if (notes) order.notes = notes
  const at = orderDate(raw.date)
  if (at) order.orderAt = at
  return order
}
