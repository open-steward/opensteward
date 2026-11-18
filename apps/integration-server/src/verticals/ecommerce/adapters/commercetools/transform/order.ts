/**
 * commercetools Order → canonical Order.
 *
 * commercetools orders carry three orthogonal state machines, which we
 * fold into the canonical `financialStatus` / `fulfillmentStatus` pair:
 *
 *  - `orderState`      Open | Confirmed | Complete | Cancelled
 *  - `paymentState`    Pending | CreditOwed | Paid | Failed | BalanceDue
 *  - `shipmentState`   Shipped | Ready | Pending | Partial | Backorder | Delayed
 *
 * `paymentState` wins for the canonical financial_status; `shipmentState`
 * wins for fulfillmentStatus. `orderState=Cancelled` forces financial to
 * `VOIDED` regardless of payment state.
 *
 * Line items: both `lineItems` (catalog-referencing) and `customLineItems`
 * (free-form additions like shipping surcharges, gift wrap) are mapped
 * into a single canonical `lineItems[]` array with a marker on the
 * custom ones' `metadata.custom = true`.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { DEFAULT_LOCALE } from '../constants'
import { moneyFromCt, pickLocalized, type RawCtMoney, type RawCtLocalizedString } from './variant'

export interface RawCtLineItem {
  id: string
  productId?: string
  variant?: { id: number; sku?: string }
  name: RawCtLocalizedString
  quantity: number
  price: {
    value: RawCtMoney
    discounted?: { value: RawCtMoney }
  }
  totalPrice?: RawCtMoney
  taxedPrice?: { totalNet?: RawCtMoney; totalGross?: RawCtMoney }
  taxRate?: { name?: string; amount?: number; includedInPrice?: boolean }
  discountedPricePerQuantity?: Array<{ quantity: number; discountedPrice?: { value?: RawCtMoney } }>
  [key: string]: unknown
}

export interface RawCtCustomLineItem {
  id: string
  name: RawCtLocalizedString
  money: RawCtMoney
  quantity: number
  slug?: string
  taxRate?: { name?: string; amount?: number }
  [key: string]: unknown
}

export interface RawCtOrderAddress {
  streetName?: string
  streetNumber?: string
  additionalStreetInfo?: string
  city?: string
  region?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface RawCtPaymentInfo {
  payments: Array<{ id: string; typeId: 'payment' }>
}

export interface RawCtOrder {
  id: string
  version?: number
  orderNumber?: string
  customerId?: string
  customerEmail?: string
  lineItems?: RawCtLineItem[]
  customLineItems?: RawCtCustomLineItem[]
  totalPrice?: RawCtMoney
  taxedPrice?: {
    totalNet?: RawCtMoney
    totalGross?: RawCtMoney
    totalTax?: RawCtMoney
  }
  shippingAddress?: RawCtOrderAddress
  billingAddress?: RawCtOrderAddress
  orderState?: string
  paymentState?: string
  shipmentState?: string
  paymentInfo?: RawCtPaymentInfo
  createdAt?: string
  lastModifiedAt?: string
  completedAt?: string
  cancelledAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_STATE_MAP: Record<string, OrderFinancialStatus> = {
  Pending: 'PENDING',
  Paid: 'PAID',
  BalanceDue: 'PARTIALLY_PAID',
  CreditOwed: 'PARTIALLY_REFUNDED',
  Failed: 'PENDING',
}

const SHIPMENT_STATE_MAP: Record<string, OrderFulfillmentStatus> = {
  Shipped: 'FULFILLED',
  Ready: 'UNFULFILLED',
  Pending: 'UNFULFILLED',
  Partial: 'PARTIAL',
  Backorder: 'UNFULFILLED',
  Delayed: 'UNFULFILLED',
}

function mapFinancialStatus(
  orderState: string | undefined,
  paymentState: string | undefined,
): OrderFinancialStatus | undefined {
  if (orderState === 'Cancelled') return 'VOIDED'
  if (paymentState) return PAYMENT_STATE_MAP[paymentState] ?? undefined
  if (orderState === 'Complete') return 'PAID'
  if (orderState === 'Confirmed') return 'AUTHORIZED'
  if (orderState === 'Open') return 'PENDING'
  return undefined
}

function mapFulfillmentStatus(
  orderState: string | undefined,
  shipmentState: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (shipmentState) return SHIPMENT_STATE_MAP[shipmentState] ?? undefined
  if (orderState === 'Complete') return 'FULFILLED'
  if (orderState === 'Cancelled') return 'UNFULFILLED'
  return 'UNFULFILLED'
}

function mapAddress(raw: RawCtOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1Parts: string[] = []
  if (raw.streetName) line1Parts.push(raw.streetName)
  if (raw.streetNumber) line1Parts.push(raw.streetNumber)
  const line1 = line1Parts.length > 0 ? line1Parts.join(' ') : undefined
  const line2 = raw.additionalStreetInfo
  const city = raw.city
  const region = raw.region ?? raw.state
  const postalCode = raw.postalCode
  const country = raw.country
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapLineItem(raw: RawCtLineItem, locale: string): LineItem {
  return {
    id: raw.id,
    productId: raw.productId,
    variantId:
      raw.variant?.id != null
        ? raw.productId
          ? `${raw.productId}:${raw.variant.id}`
          : String(raw.variant.id)
        : undefined,
    title: pickLocalized(raw.name, locale) ?? '',
    quantity: raw.quantity,
    price: moneyFromCt(raw.price.value) ?? { amount: 0, currency: 'USD' },
    sku: raw.variant?.sku,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapCustomLineItem(raw: RawCtCustomLineItem, locale: string): LineItem {
  return {
    id: raw.id,
    title: pickLocalized(raw.name, locale) ?? '',
    quantity: raw.quantity,
    price: moneyFromCt(raw.money) ?? { amount: 0, currency: 'USD' },
    metadata: { ...(raw as unknown as Record<string, unknown>), custom: true },
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCtOrder, locale: string = DEFAULT_LOCALE): Order {
  const total = moneyFromCt(raw.totalPrice)
  const currency = total?.currency ?? raw.totalPrice?.currencyCode ?? 'USD'
  const lineItems = [
    ...(raw.lineItems ?? []).map((li) => mapLineItem(li, locale)),
    ...(raw.customLineItems ?? []).map((li) => mapCustomLineItem(li, locale)),
  ]
  const totalTax = moneyFromCt(raw.taxedPrice?.totalTax)
  const totalNet = moneyFromCt(raw.taxedPrice?.totalNet)

  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    name: raw.orderNumber ? `#${raw.orderNumber}` : undefined,
    customerId: raw.customerId,
    email: raw.customerEmail,
    currency,
    subtotalPrice: totalNet,
    totalTax,
    totalPrice: total,
    financialStatus: mapFinancialStatus(raw.orderState, raw.paymentState),
    fulfillmentStatus: mapFulfillmentStatus(raw.orderState, raw.shipmentState),
    lineItems,
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    transactionIds: raw.paymentInfo?.payments?.map((p) => p.id),
    createdAt: raw.createdAt,
    updatedAt: raw.lastModifiedAt,
    processedAt: raw.completedAt,
    cancelledAt: raw.cancelledAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → commercetools order draft body. commercetools orders
 * are NOT created directly; the caller must first POST a Cart and then
 * POST `/orders` referencing that cart. This function returns the cart
 * draft used in step 1. See `index.ts#createOrder`.
 */
export function untransformOrder(
  order: Partial<Order>,
): Record<string, unknown> {
  const currency = order.currency ?? order.totalPrice?.currency ?? 'USD'
  return {
    currency,
    customerEmail: order.email,
    lineItems: order.lineItems
      ?.filter((li) => li.variantId != null)
      .map((li) => {
        const [productId, variantIdStr] = (li.variantId as string).split(':')
        const variantId = variantIdStr ? parseInt(variantIdStr, 10) : undefined
        return {
          productId,
          variantId,
          quantity: li.quantity,
        }
      }),
  }
}

/**
 * Translate canonical partial Order updates to commercetools order update
 * actions. Only a handful of canonical fields have a 1:1 action; the rest
 * are no-ops.
 */
export function buildActionsForOrder(
  _current: RawCtOrder,
  updates: Partial<Order>,
): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = []
  if (updates.email !== undefined) {
    actions.push({ action: 'setCustomerEmail', email: updates.email })
  }
  if (updates.note !== undefined) {
    // commercetools stores generic merchant notes under setCustomField /
    // setCustomType — not a first-class field. Emit a no-op marker.
    actions.push({
      action: 'setCustomField',
      name: 'canonicalNote',
      value: updates.note,
    })
  }
  return actions
}
