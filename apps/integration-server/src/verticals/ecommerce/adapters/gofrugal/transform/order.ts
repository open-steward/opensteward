/**
 * GOFRUGAL Sales Order → canonical Order.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 * (create/retrieve sales order articles — field names below are taken
 * verbatim from the documented request/response JSON examples).
 *
 * `GET /salesOrders/{id}` and `POST /salesOrders` responses wrap the order
 * under a `salesOrder` key; `GET /salesOrders` (list) wraps an array under
 * `salesOrders`. `status` is documented only as a free-form string (the
 * sample shows `"pending"`) — no published enum — so anything other than
 * the one documented value maps to the canonical `'unknown'` member rather
 * than being guessed. There is no separate fulfillment-status field.
 *
 * `shippingPincode`/`customerPincode` are documented as numbers; canonical
 * `Address.postalCode` is a string, so they're stringified. `country` is a
 * free-form name ("india") rather than ISO 3166-1 alpha-2, so it's mapped
 * through a small lookup before being assigned to the strict
 * `Address.country` field — anything not recognised is dropped rather than
 * failing the whole transform.
 *
 * No currency field is reported anywhere in this API — GOFRUGAL is used
 * outside India too, so `currency` is a required parameter sourced from the
 * connection's own credentials (see ../client.ts and ../connect-form.ts),
 * never a hardcoded default.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Order, LineItem, OrderFinancialStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawGofrugalOrderItem {
  rowNo?: number
  itemId: number
  itemName?: string
  itemReferenceCode?: string
  /** Always shown in the documented create/retrieve sales-order examples — required so a missing value fails loudly instead of pricing at 0. */
  salePrice: number
  quantity: number
  itemAmount?: number
  taxPercentage?: number
  discountPercentage?: number
}

export interface RawGofrugalSalesOrder {
  onlineReferenceNo: number | string
  createdAt?: string
  updatedAt?: string
  status?: string
  orderRemarks?: string
  totalQuantity?: number
  totalAmount?: number
  totalTaxAmount?: number
  totalDiscountAmount?: number
  shippingId?: string
  shippingName?: string
  shippingAddress1?: string
  ShippingAddress2?: string
  shippingPlace?: string
  shippingState?: string
  shippingCountry?: string
  shippingPincode?: number | string
  shippingPhone?: string
  shippingMobile?: string
  shippingEmail?: string
  deliveryDate?: string
  locationId?: number
  orderItems?: RawGofrugalOrderItem[]
  customerId?: number | string
  customerName?: string
  customerAddressLine1?: string
  customerAddressLine2?: string
  customerCity?: string
  customerState?: string
  customerCountry?: string
  customerPincode?: number | string
  customerPhone?: string
  customerEmail?: string
  customerMobile?: string
  [key: string]: unknown
}

/**
 * GOFRUGAL's public docs show exactly one example `country` value: the
 * lowercase full name `"india"`. RetailEasy is used outside India as well,
 * so this maps only that one documented value to its ISO 3166-1 alpha-2
 * code — any other value (a different country name we have no documented
 * example of, an already-alpha-2 code, a typo, etc.) is left unset rather
 * than guessed or defaulted to India.
 */
const COUNTRY_NAME_TO_ALPHA2: Record<string, string> = {
  india: 'IN',
}

function normalizeCountry(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return COUNTRY_NAME_TO_ALPHA2[raw.trim().toLowerCase()]
}

function mapStatus(status: string | undefined): OrderFinancialStatus {
  return status?.toLowerCase() === 'pending' ? 'PENDING' : 'unknown'
}

function mapLineItem(raw: RawGofrugalOrderItem, index: number, currency: string): LineItem {
  if (raw.salePrice == null) {
    throw new Error(
      `GOFRUGAL order item for itemId ${raw.itemId} is missing "salePrice" — cannot compute a unit price.`,
    )
  }
  return {
    id: `row-${raw.rowNo ?? index + 1}`,
    productId: String(raw.itemId),
    title: raw.itemName ?? String(raw.itemId),
    quantity: raw.quantity,
    price: {
      amount: majorToMinor(raw.salePrice, currency),
      currency,
    },
    sku: raw.itemReferenceCode || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(raw: RawGofrugalSalesOrder): Address | undefined {
  const country = normalizeCountry(raw.shippingCountry)
  if (!raw.shippingAddress1 && !raw.shippingPlace && !raw.shippingPincode && !country) return undefined
  return {
    line1: raw.shippingAddress1,
    line2: raw.ShippingAddress2,
    city: raw.shippingPlace,
    region: raw.shippingState,
    postalCode: raw.shippingPincode != null ? String(raw.shippingPincode) : undefined,
    country,
  }
}

function mapBillingAddress(raw: RawGofrugalSalesOrder): Address | undefined {
  const country = normalizeCountry(raw.customerCountry)
  if (!raw.customerAddressLine1 && !raw.customerCity && !raw.customerPincode && !country) return undefined
  return {
    line1: raw.customerAddressLine1,
    line2: raw.customerAddressLine2,
    city: raw.customerCity,
    region: raw.customerState,
    postalCode: raw.customerPincode != null ? String(raw.customerPincode) : undefined,
    country,
  }
}

/** `currency` — the connection's own ISO 4217 code (see file header); never defaulted. */
export function transformOrder(raw: RawGofrugalSalesOrder, currency: string): Order {
  const id = String(raw.onlineReferenceNo)
  return {
    id,
    orderNumber: id,
    name: id,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    email: raw.customerEmail,
    phone: raw.customerMobile ?? raw.customerPhone,
    currency,
    totalPrice:
      raw.totalAmount != null ? { amount: majorToMinor(raw.totalAmount, currency), currency } : undefined,
    totalTax:
      raw.totalTaxAmount != null
        ? { amount: majorToMinor(raw.totalTaxAmount, currency), currency }
        : undefined,
    totalDiscounts:
      raw.totalDiscountAmount != null
        ? { amount: majorToMinor(raw.totalDiscountAmount, currency), currency }
        : undefined,
    financialStatus: mapStatus(raw.status),
    lineItems: (raw.orderItems ?? []).map((item, i) => mapLineItem(item, i, currency)),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    note: raw.orderRemarks || undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → GOFRUGAL create-sales-order body (`POST /salesOrders`,
 * wrapped as `{ salesOrder: {...} }` by the caller).
 *
 * GOFRUGAL documents these fields as MANDATORY on create: customer
 * (`customerId`, `customerName`, `customerMobile`, `customerEmail`,
 * `customerPincode`), shipping (`shippingId`, `shippingName`,
 * `shippingAddress1`, `shippingState`, `shippingCountry`, `shippingPincode`,
 * `shippingMobile`, `shippingEmail`, `deliveryDate`), and order items
 * (`itemId`, `itemReferenceCode`, `quantity`). Several of these — a
 * customer/recipient DISPLAY NAME, a shipping-method id, a delivery date —
 * have no canonical `Order` field at all, so they must come from
 * `data.metadata`. Rather than send an under-populated request GOFRUGAL
 * would reject for undocumented reasons, every mandatory field is checked
 * here and a specific, complete list of what's missing is thrown — no
 * field is ever silently sent as `undefined` or defaulted to `''`.
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const customerName = meta['customerName'] as string | undefined
  const shippingId = meta['shippingId'] as string | undefined
  const shippingName = meta['shippingName'] as string | undefined
  const deliveryDate = meta['deliveryDate'] as string | undefined
  const ship = order.shippingAddress
  const bill = order.billingAddress

  const missing: string[] = []
  if (!order.customerId) missing.push('customerId')
  if (!customerName) missing.push('metadata.customerName')
  if (!order.phone) missing.push('phone (→ customerMobile/shippingMobile)')
  if (!order.email) missing.push('email (→ customerEmail/shippingEmail)')
  if (!bill?.postalCode) missing.push('billingAddress.postalCode (→ customerPincode)')
  if (!shippingId) missing.push('metadata.shippingId')
  if (!shippingName) missing.push('metadata.shippingName')
  if (!ship?.line1) missing.push('shippingAddress.line1')
  if (!ship?.region) missing.push('shippingAddress.region (→ shippingState)')
  if (!ship?.country) missing.push('shippingAddress.country (→ shippingCountry)')
  if (!ship?.postalCode) missing.push('shippingAddress.postalCode (→ shippingPincode)')
  if (!deliveryDate) missing.push('metadata.deliveryDate')
  if (!order.lineItems || order.lineItems.length === 0) missing.push('lineItems')
  if (missing.length > 0) {
    throw new Error(
      `Cannot create a GOFRUGAL sales order — missing mandatory field(s): ${missing.join(', ')}.`,
    )
  }

  const orderItems = order.lineItems!.map((li, i) => {
    if (!li.productId) throw new Error(`GOFRUGAL order line item ${i + 1} is missing productId (itemId).`)
    if (!li.sku) throw new Error(`GOFRUGAL order line item ${i + 1} is missing sku (itemReferenceCode).`)
    return { rowNo: i + 1, itemId: Number(li.productId), itemReferenceCode: li.sku, quantity: li.quantity }
  })

  return {
    orderRemarks: order.note,
    customerId: order.customerId,
    customerName,
    customerEmail: order.email,
    customerMobile: order.phone,
    customerAddressLine1: bill!.line1,
    customerAddressLine2: bill!.line2,
    customerCity: bill!.city,
    customerState: bill!.region,
    customerPincode: bill!.postalCode,
    shippingId,
    shippingName,
    shippingAddress1: ship!.line1,
    ShippingAddress2: ship!.line2,
    shippingPlace: ship!.city,
    shippingState: ship!.region,
    shippingCountry: ship!.country,
    shippingPincode: ship!.postalCode,
    shippingMobile: order.phone,
    shippingEmail: order.email,
    deliveryDate,
    orderItems,
  }
}
