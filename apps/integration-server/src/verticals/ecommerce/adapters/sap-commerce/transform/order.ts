/**
 * SAP Commerce Cloud Order → canonical Order.
 *
 * The OCC API returns orders with:
 *  - `code` as the order identifier
 *  - `entries[]` as line items (not `lineItems`)
 *  - `totalPrice`, `totalTax`, `deliveryCost`, `subTotal` as price objects
 *  - `statusDisplay` for order status
 *  - `deliveryAddress` for shipping
 *  - `paymentAddress` for billing
 *  - `user` for customer info
 *
 * SAP Commerce uses a state machine with `status`, `statusDisplay`,
 * `deliveryStatus`, and custom order processes.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSapOrderPrice {
  currencyIso?: string
  value?: number
  formattedValue?: string
  priceType?: string
}

export interface RawSapOrderEntry {
  entryNumber?: number
  product?: {
    code?: string
    name?: string
    url?: string
  }
  quantity?: number
  basePrice?: RawSapOrderPrice
  totalPrice?: RawSapOrderPrice
  updateable?: boolean
  [key: string]: unknown
}

export interface RawSapOrderAddress {
  line1?: string
  line2?: string
  town?: string
  region?: { isocode?: string; name?: string }
  postalCode?: string
  country?: { isocode?: string; name?: string }
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface RawSapOrder {
  code: string
  guid?: string
  statusDisplay?: string
  status?: string
  deliveryStatus?: string
  deliveryStatusDisplay?: string
  entries?: RawSapOrderEntry[]
  totalPrice?: RawSapOrderPrice
  totalPriceWithTax?: RawSapOrderPrice
  totalTax?: RawSapOrderPrice
  subTotal?: RawSapOrderPrice
  deliveryCost?: RawSapOrderPrice
  totalDiscounts?: RawSapOrderPrice
  deliveryAddress?: RawSapOrderAddress
  paymentAddress?: RawSapOrderAddress
  paymentInfo?: {
    id?: string
    accountHolderName?: string
    cardType?: { code?: string; name?: string }
    cardNumber?: string
    expiryMonth?: string
    expiryYear?: string
    [key: string]: unknown
  }
  user?: {
    uid?: string
    name?: string
  }
  appliedOrderPromotions?: Array<{
    description?: string
    promotionData?: { code?: string }
    [key: string]: unknown
  }>
  appliedProductPromotions?: Array<{
    description?: string
    promotionData?: { code?: string }
    [key: string]: unknown
  }>
  created?: string
  statusDate?: string
  cancelledDate?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawSapOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  if (!raw.line1 && !raw.town && !raw.postalCode) return undefined
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.town,
    region: raw.region?.isocode ?? raw.region?.name,
    postalCode: raw.postalCode,
    country: raw.country?.isocode ?? raw.country?.name,
  }
}

function mapFinancialStatus(raw: RawSapOrder): OrderFinancialStatus {
  const status = (raw.status ?? raw.statusDisplay ?? '').toLowerCase()
  if (status.includes('cancel')) return 'VOIDED'
  if (status.includes('refund')) return 'REFUNDED'
  if (status.includes('paid') || status.includes('completed') || status.includes('complete')) return 'PAID'
  if (status.includes('processing') || status.includes('created')) return 'AUTHORIZED'
  return 'PENDING'
}

function mapFulfillmentStatus(raw: RawSapOrder): OrderFulfillmentStatus {
  const delivery = (raw.deliveryStatus ?? raw.deliveryStatusDisplay ?? '').toLowerCase()
  const status = (raw.status ?? raw.statusDisplay ?? '').toLowerCase()
  if (delivery.includes('part') || status.includes('part')) return 'PARTIAL'
  if (delivery.includes('shipped') || status.includes('shipped') || status.includes('completed')) return 'FULFILLED'
  return 'UNFULFILLED'
}

function mapLineItem(entry: RawSapOrderEntry): LineItem {
  return {
    id: String(entry.entryNumber ?? 0),
    productId: entry.product?.code,
    title: entry.product?.name ?? entry.product?.code ?? '',
    quantity: entry.quantity ?? 1,
    price: {
      amount: majorToMinor(entry.basePrice?.value ?? 0, entry.basePrice?.currencyIso ?? 'USD'),
      currency: entry.basePrice?.currencyIso ?? 'USD',
    },
    metadata: entry as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSapOrder): Order {
  return {
    id: raw.code,
    orderNumber: raw.code,
    name: `#${raw.code}`,
    customerId: raw.user?.uid,
    email: raw.paymentAddress?.email ?? raw.deliveryAddress?.email,
    currency: raw.totalPrice?.currencyIso,
    subtotalPrice: raw.subTotal
      ? { amount: majorToMinor(raw.subTotal.value ?? 0, raw.subTotal.currencyIso ?? 'USD'), currency: raw.subTotal.currencyIso ?? 'USD' }
      : undefined,
    totalTax: raw.totalTax
      ? { amount: majorToMinor(raw.totalTax.value ?? 0, raw.totalTax.currencyIso ?? 'USD'), currency: raw.totalTax.currencyIso ?? 'USD' }
      : undefined,
    totalDiscounts: raw.totalDiscounts
      ? { amount: majorToMinor(raw.totalDiscounts.value ?? 0, raw.totalDiscounts.currencyIso ?? 'USD'), currency: raw.totalDiscounts.currencyIso ?? 'USD' }
      : undefined,
    totalShipping: raw.deliveryCost
      ? { amount: majorToMinor(raw.deliveryCost.value ?? 0, raw.deliveryCost.currencyIso ?? 'USD'), currency: raw.deliveryCost.currencyIso ?? 'USD' }
      : undefined,
    totalPrice: raw.totalPriceWithTax ?? raw.totalPrice
      ? {
          amount: majorToMinor((raw.totalPriceWithTax ?? raw.totalPrice)?.value ?? 0, (raw.totalPriceWithTax ?? raw.totalPrice)?.currencyIso ?? 'USD'),
          currency: (raw.totalPriceWithTax ?? raw.totalPrice)?.currencyIso ?? 'USD',
        }
      : undefined,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: raw.entries?.map(mapLineItem),
    billingAddress: mapAddress(raw.paymentAddress),
    shippingAddress: mapAddress(raw.deliveryAddress),
    discountCodes: raw.appliedOrderPromotions
      ?.map((p) => p.promotionData?.code)
      .filter((c): c is string => !!c),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.statusDate),
    cancelledAt: toIsoDatetime(raw.cancelledDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical order → SAP Commerce Cart body. Orders in SAP Commerce are
 * created from carts, so this produces a cart-like payload.
 */
export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  const entries = order.lineItems?.map((li, idx) => ({
    entryNumber: idx,
    product: { code: li.productId ?? li.id },
    quantity: li.quantity,
  }))
  return {
    entries,
    deliveryAddress: order.shippingAddress
      ? {
          line1: order.shippingAddress.line1,
          line2: order.shippingAddress.line2,
          town: order.shippingAddress.city,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country
            ? { isocode: order.shippingAddress.country }
            : undefined,
        }
      : undefined,
  }
}
