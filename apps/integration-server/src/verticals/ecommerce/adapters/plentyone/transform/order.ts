/**
 * PlentyONE Order → canonical Order.
 *
 * PlentyONE orders have a complex structure:
 *  - `amounts[]`          – monetary totals per currency (we use the system currency entry)
 *  - `orderItems[]`       – line items; typeId 1 = variation, 6 = shipping costs
 *  - `addressRelations[]` – typeId 1 = billing, typeId 2 = delivery (addresses resolved by id)
 *  - `relations[]`        – contact (customer) id among other relations
 *  - `properties[]`       – order-level custom key-value pairs
 *  - `statusId`           – numeric status code (3.0 = waiting for payment, etc.)
 *
 * Endpoints used:
 *   GET /rest/orders?with=amounts,orderItems,billingAddress,deliveryAddress
 *   GET /rest/orders/{orderId}?with=amounts,orderItems,billingAddress,deliveryAddress
 *   POST /rest/orders
 *   PUT /rest/orders/{orderId}
 *   PUT /rest/orders/{orderId}/cancel
 */

import type { Order, LineItem, OrderFinancialStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { ORDER_ITEM_TYPE_VARIATION, ORDER_ITEM_TYPE_SHIPPING, ADDRESS_TYPE_BILLING, ADDRESS_TYPE_DELIVERY } from '../constants'

// ── Currency-aware write helper ───────────────────────────────────────────────

const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Convert canonical integer minor units back to major-unit decimal for the upstream API. */
function minorToMajorWrite(amount: number, currency: string): number {
  const c = currency.toUpperCase()
  const exponent = ZERO_DECIMAL_CURRENCIES.has(c) ? 0 : THREE_DECIMAL_CURRENCIES.has(c) ? 3 : 2
  return amount / 10 ** exponent
}

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneOrderAmount {
  isSystemCurrency?: boolean
  currency?: string | null
  grossTotal?: number | null
  netTotal?: number | null
  vatTotal?: number | null
  shippingCostsGross?: number | null
  shippingCostsNet?: number | null
  giftCardAmount?: number | null
  prepaidShippingCosts?: number | null
  [key: string]: unknown
}

export interface RawPlentyOneOrderItemAmount {
  priceGross?: number | null
  priceNet?: number | null
  surcharge?: number | null
  discount?: number | null
  vatValue?: number | null
  currency?: string | null
  [key: string]: unknown
}

export interface RawPlentyOneOrderItem {
  id: number | string
  orderId?: number | string
  typeId?: number
  itemVariationId?: number | string | null
  quantity?: number
  orderItemName?: string | null
  amounts?: RawPlentyOneOrderItemAmount[]
  [key: string]: unknown
}

export interface RawPlentyOneOrderAddress {
  name1?: string | null
  name2?: string | null
  name3?: string | null
  address1?: string | null
  address2?: string | null
  postalCode?: string | null
  town?: string | null
  countryIsoCode2?: string | null
  [key: string]: unknown
}

export interface RawPlentyOneAddressRelation {
  typeId?: number
  addressId?: number | string
}

export interface RawPlentyOneOrderRelation {
  referenceType?: string
  referenceId?: number | string
  relation?: string
}

export interface RawPlentyOneOrder {
  id: number | string
  typeId?: number
  statusId?: number
  plentyId?: number
  locationId?: number
  ownerId?: number
  referrerId?: number
  createdAt?: string
  updatedAt?: string
  amounts?: RawPlentyOneOrderAmount[]
  orderItems?: RawPlentyOneOrderItem[]
  addressRelations?: RawPlentyOneAddressRelation[]
  relations?: RawPlentyOneOrderRelation[]
  // When requested with=billingAddress,deliveryAddress these are inlined
  billingAddress?: RawPlentyOneOrderAddress | null
  deliveryAddress?: RawPlentyOneOrderAddress | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickAmount(amounts: RawPlentyOneOrderAmount[] | undefined): RawPlentyOneOrderAmount | undefined {
  if (!amounts || amounts.length === 0) return undefined
  return amounts.find((a) => a.isSystemCurrency) ?? amounts[0]
}

function toMinor(v: number | null | undefined, currency: string): number {
  return majorToMinor(v ?? 0, currency)
}

/**
 * Map PlentyONE statusId to canonical OrderFinancialStatus.
 * PlentyONE statuses 1–4 indicate pending/unpaid states; 5–7 = paid/cleared;
 * 8 = to be cancelled; 9 = return/refunded; 10 = warranty.
 */
function mapFinancialStatus(statusId: number | undefined): OrderFinancialStatus | undefined {
  if (statusId == null) return undefined
  const s = Math.floor(statusId)
  if (s <= 4) return 'PENDING'
  if (s <= 7) return 'PAID'
  if (s === 8) return 'VOIDED'
  if (s === 9 || s === 10) return 'REFUNDED'
  return undefined
}

function mapAddress(raw: RawPlentyOneOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.town ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryIsoCode2 ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    postalCode,
    country,
  }
}

function mapLineItems(
  items: RawPlentyOneOrderItem[] | undefined,
  currency: string,
): LineItem[] {
  if (!items) return []
  return items
    .filter((i) => i.typeId === ORDER_ITEM_TYPE_VARIATION)
    .map((raw) => {
      const amt = raw.amounts?.[0]
      const unitPrice = amt?.priceGross ?? 0
      return {
        id: String(raw.id),
        variantId: raw.itemVariationId != null ? String(raw.itemVariationId) : undefined,
        title: raw.orderItemName ?? '',
        quantity: raw.quantity ?? 1,
        price: { amount: toMinor(unitPrice, currency), currency },
        metadata: raw as unknown as Record<string, unknown>,
      }
    })
}

function findContactId(relations: RawPlentyOneOrderRelation[] | undefined): string | undefined {
  if (!relations) return undefined
  const rel = relations.find((r) => r.referenceType === 'contact' || r.relation === 'receiver')
  return rel?.referenceId != null ? String(rel.referenceId) : undefined
}

function findShipping(
  items: RawPlentyOneOrderItem[] | undefined,
  currency: string,
): { amount: number; currency: string } | undefined {
  if (!items) return undefined
  const shippingItem = items.find((i) => i.typeId === ORDER_ITEM_TYPE_SHIPPING)
  const amt = shippingItem?.amounts?.[0]
  if (!amt || amt.priceGross == null) return undefined
  return { amount: toMinor(amt.priceGross, currency), currency }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawPlentyOneOrder): Order {
  const amountEntry = pickAmount(raw.amounts)
  const currency = amountEntry?.currency ?? 'EUR'

  const billingAddr = raw.billingAddress
    ? mapAddress(raw.billingAddress)
    : undefined
  const deliveryAddr = raw.deliveryAddress
    ? mapAddress(raw.deliveryAddress)
    : undefined

  const grossTotal = amountEntry?.grossTotal
  const vatTotal = amountEntry?.vatTotal
  const shippingGross = amountEntry?.shippingCostsGross

  return {
    id: String(raw.id),
    orderNumber: String(raw.id),
    currency,
    customerId: findContactId(raw.relations),
    financialStatus: mapFinancialStatus(raw.statusId),
    lineItems: mapLineItems(raw.orderItems, currency),
    billingAddress: billingAddr,
    shippingAddress: deliveryAddr,
    totalPrice: grossTotal != null ? { amount: toMinor(grossTotal, currency), currency } : undefined,
    totalTax: vatTotal != null ? { amount: toMinor(vatTotal, currency), currency } : undefined,
    totalShipping: findShipping(raw.orderItems, currency) ??
      (shippingGross != null ? { amount: toMinor(shippingGross, currency), currency } : undefined),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → PlentyONE order body for create/update. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const orderItems: Record<string, unknown>[] = []
  for (const li of order.lineItems ?? []) {
    orderItems.push({
      typeId: ORDER_ITEM_TYPE_VARIATION,
      itemVariationId: li.variantId ? Number(li.variantId) : undefined,
      quantity: li.quantity,
      orderItemName: li.title,
      amounts: li.price
        ? [{ priceGross: minorToMajorWrite(li.price.amount, li.price.currency), currency: li.price.currency }]
        : undefined,
    })
  }
  const body: Record<string, unknown> = {
    typeId: 1, // Sales order
    orderItems: orderItems.length > 0 ? orderItems : undefined,
  }
  if (order.currency) {
    body['amounts'] = [{ currency: order.currency, isSystemCurrency: true }]
  }
  return body
}

/** Return the address relation typeId for billing vs delivery. */
export { ADDRESS_TYPE_BILLING, ADDRESS_TYPE_DELIVERY }
