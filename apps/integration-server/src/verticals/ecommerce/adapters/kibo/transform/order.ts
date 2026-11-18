/**
 * Kibo Commerce Order → canonical Order.
 *
 * Kibo orders live at `GET /api/commerce/orders`.
 *
 * Key fields:
 *   - `id`                   → id
 *   - `orderNumber`          → orderNumber (integer, stringified)
 *   - `status`               → financial + fulfillment status (see mapping below)
 *   - `total`                → totalPrice
 *   - `subtotal`             → subtotalPrice
 *   - `taxTotal`             → totalTax
 *   - `shippingTotal`        → totalShipping
 *   - `discountTotal`        → totalDiscounts
 *   - `billingInfo`          → billingAddress
 *   - `fulfillmentInfo`      → shippingAddress
 *   - `items[]`              → lineItems
 *   - `currencyCode`         → currency
 *
 * Status mapping:
 *   Pending              → PENDING / UNFULFILLED
 *   Accepted / Processing → PENDING / PARTIAL
 *   Fulfilled            → PAID / FULFILLED
 *   Cancelled            → VOIDED / CANCELLED
 *   Returned             → REFUNDED / CANCELLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Kibo shapes ───────────────────────────────────────────────────────────

export interface RawKiboAddress {
  firstName?: string
  lastNameOrSurname?: string
  address1?: string
  address2?: string
  cityOrTown?: string
  stateOrProvince?: string
  postalOrZipCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface RawKiboBillingInfo {
  firstName?: string
  lastNameOrSurname?: string
  billingContact?: {
    firstName?: string
    lastNameOrSurname?: string
    address?: RawKiboAddress
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawKiboFulfillmentInfo {
  shippingMethodName?: string
  fulfillmentContact?: {
    firstName?: string
    lastNameOrSurname?: string
    address?: RawKiboAddress
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawKiboDiscount {
  discount?: { name?: string; [key: string]: unknown }
  impact?: number
  [key: string]: unknown
}

export interface RawKiboLineItem {
  id?: string
  lineId?: number
  productCode?: string
  variationProductCode?: string
  name?: string
  quantity?: number
  unitPrice?: { listAmount?: number; saleAmount?: number }
  total?: number
  discountTotal?: number
  taxTotal?: number
  taxRate?: number
  sku?: string
  fulfillmentMethod?: string
  fulfillmentLocationCode?: string
  [key: string]: unknown
}

export interface RawKiboOrder {
  id?: string
  orderNumber?: number
  status?: string
  submittedDate?: string
  closedDate?: string
  cancelledDate?: string
  lastModifiedDate?: string
  email?: string
  total?: number
  subtotal?: number
  taxTotal?: number
  shippingTotal?: number
  handlingTotal?: number
  discountTotal?: number
  currencyCode?: string
  billingInfo?: RawKiboBillingInfo
  fulfillmentInfo?: RawKiboFulfillmentInfo
  items?: RawKiboLineItem[]
  discountCodes?: string[]
  notes?: Array<{ text?: string; [key: string]: unknown }>
  userId?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'fulfilled':
    case 'completed':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    case 'returned':
      return 'REFUNDED'
    case 'pending':
    case 'accepted':
    case 'processing':
    default:
      return 'PENDING'
  }
}

function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'fulfilled':
    case 'completed':
      return 'FULFILLED'
    case 'cancelled':
    case 'returned':
      return 'UNFULFILLED'
    case 'accepted':
    case 'processing':
      return 'PARTIAL'
    case 'pending':
    default:
      return 'UNFULFILLED'
  }
}

function mapAddress(addr: RawKiboAddress | undefined): Address | undefined {
  if (!addr) return undefined
  const line1 = addr.address1
  const line2 = addr.address2
  const city = addr.cityOrTown
  const region = addr.stateOrProvince
  const postalCode = addr.postalOrZipCode
  const country = addr.countryCode
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapBillingAddress(billing: RawKiboBillingInfo | undefined): Address | undefined {
  if (!billing) return undefined
  return mapAddress(billing.billingContact?.address)
}

function mapShippingAddress(fulfillment: RawKiboFulfillmentInfo | undefined): Address | undefined {
  if (!fulfillment) return undefined
  return mapAddress(fulfillment.fulfillmentContact?.address)
}

function mapLineItems(items: RawKiboLineItem[] | undefined, currency: string): LineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((item): LineItem => {
    const unitAmount = item.unitPrice?.saleAmount ?? item.unitPrice?.listAmount ?? 0
    const discountAmt = item.discountTotal
    return {
      id: item.id ?? String(item.lineId ?? ''),
      productId: item.productCode,
      variantId: item.variationProductCode,
      title: item.name ?? '',
      quantity: item.quantity ?? 0,
      price: { amount: majorToMinor(unitAmount, currency), currency },
      totalDiscount: discountAmt != null ? { amount: majorToMinor(discountAmt, currency), currency } : undefined,
      sku: item.sku,
      metadata: item as Record<string, unknown>,
    }
  })
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawKiboOrder): Order {
  const currency = raw.currencyCode ?? 'USD'

  return {
    id: raw.id ?? '',
    orderNumber: raw.orderNumber != null ? String(raw.orderNumber) : undefined,
    customerId: raw.userId,
    email: raw.email,
    currency,
    subtotalPrice: raw.subtotal != null ? { amount: majorToMinor(raw.subtotal, currency), currency } : undefined,
    totalTax: raw.taxTotal != null ? { amount: majorToMinor(raw.taxTotal, currency), currency } : undefined,
    totalDiscounts: raw.discountTotal != null ? { amount: majorToMinor(raw.discountTotal, currency), currency } : undefined,
    totalShipping: raw.shippingTotal != null ? { amount: majorToMinor(raw.shippingTotal, currency), currency } : undefined,
    totalPrice: raw.total != null ? { amount: majorToMinor(raw.total, currency), currency } : undefined,
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: mapLineItems(raw.items, currency),
    billingAddress: mapBillingAddress(raw.billingInfo),
    shippingAddress: mapShippingAddress(raw.fulfillmentInfo),
    discountCodes: raw.discountCodes,
    note: raw.notes?.[0]?.text,
    createdAt: raw.submittedDate,
    updatedAt: raw.lastModifiedDate,
    cancelledAt: raw.cancelledDate,
    metadata: raw as Record<string, unknown>,
  }
}
