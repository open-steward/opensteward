import { z } from 'zod'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'

/**
 * One AWB of `POST order/get_details.json`
 * (https://docs.ithinklogistics.com/doc-order-details/3). The response is
 * `{"status": "success", "status_code": 200, "data": {"<key>": {...}}}`: `data`
 * is an object of these rows, not an array. Only fields the documented example
 * shows are read.
 *
 * Not mapped, on purpose:
 * - money (`total_amount`, `product_price`, ...): the docs name no currency,
 *   and an amount without one cannot be a canonical amount;
 * - `order_date`, `awb_created_date`, `last_scan_datetime`: "2022-04-10
 *   08:57:27", with no documented time zone;
 * - `customer_country` ("India") and `billing_*`: a country name is not ISO
 *   3166 alpha-2, and a billing address is not the origin.
 * All of them stay on `metadata`.
 */
export interface IthinkLogisticsOrderProductRaw {
  product_name?: string | null
  product_sku?: string | null
  product_quantity?: string | number | null
  product_price?: string | null
  product_total?: string | null
  [key: string]: unknown
}

export interface IthinkLogisticsOrderRaw {
  awb_no?: string | null
  order?: string | null
  sub_order?: string | null
  order_date?: string | null
  awb_created_date?: string | null
  total_amount?: string | null
  customer_name?: string | null
  company_name?: string | null
  customer_address1?: string | null
  customer_address2?: string | null
  customer_address3?: string | null
  customer_pincode?: string | null
  customer_city?: string | null
  customer_state?: string | null
  customer_country?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  products?: IthinkLogisticsOrderProductRaw[] | null
  pickup_address_id?: string | number | null
  logistic?: string | null
  last_scan_datetime?: string | null
  latest_courier_status?: string | null
  [key: string]: unknown
}

/**
 * The courier statuses iThink documents on its tracking page
 * (https://docs.ithinklogistics.com/doc-track-order/3, "Status - Status
 * Code"), which `latest_courier_status` carries (the order-details example
 * shows "delivered"). Compared case-insensitively. Anything else is 'unknown'.
 */
const ORDER_STATUS: Record<string, OrderStatus> = {
  manifested: 'AWAITING_SHIPMENT',
  'not picked': 'AWAITING_SHIPMENT',
  'picked up': 'SHIPPED',
  'in transit': 'SHIPPED',
  'reached at destination': 'SHIPPED',
  'out for delivery': 'SHIPPED',
  undelivered: 'SHIPPED',
  'out of delivery area': 'SHIPPED',
  delayed: 'SHIPPED',
  misrouted: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  'rev cancelled': 'CANCELLED',
  'rev closed': 'CANCELLED',
  'rto delivered': 'RETURNED',
  'rev delivered': 'RETURNED',
}

export function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'unknown'
  return ORDER_STATUS[status.trim().toLowerCase()] ?? 'unknown'
}

const Email = z.email()

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

function destinationOf(raw: IthinkLogisticsOrderRaw): Address | undefined {
  const email = text(raw.customer_email)
  const address: Address = {
    name: text(raw.customer_name),
    company: text(raw.company_name),
    street1: text(raw.customer_address1),
    street2: text(raw.customer_address2),
    city: text(raw.customer_city),
    state: text(raw.customer_state),
    postalCode: text(raw.customer_pincode),
    phone: text(raw.customer_phone),
    email: email && Email.safeParse(email).success ? email : undefined,
  }
  const set = Object.fromEntries(
    Object.entries(address).filter(([, v]) => v !== undefined),
  ) as Address
  return Object.keys(set).length > 0 ? set : undefined
}

function lineItemOf(p: IthinkLogisticsOrderProductRaw): Lineitem {
  const qty = Number(text(p.product_quantity))
  return {
    sku: text(p.product_sku),
    name: text(p.product_name),
    quantity: Number.isInteger(qty) && qty >= 0 ? qty : undefined,
  }
}

export function transformOrder(raw: IthinkLogisticsOrderRaw): Order {
  const awb = text(raw.awb_no)
  if (!awb) throw new Error('iThink Logistics order details row has no awb_no')
  const products = raw.products ?? []
  return {
    id: awb,
    orderNumber: text(raw.order),
    status: mapOrderStatus(raw.latest_courier_status),
    warehouseId: text(raw.pickup_address_id),
    shipmentIds: [awb],
    destinationAddress: destinationOf(raw),
    lineItems: products.length > 0 ? products.map(lineItemOf) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
