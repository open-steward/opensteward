/**
 * OTTO Market Order → canonical Order.
 *
 * The public docs *page* for Orders v4 shows no worked JSON, but the docs
 * site's own asset bundle embeds the real OpenAPI spec for it (schema
 * definitions AND worked examples), fetched and read directly from
 * https://api.otto.market/docs/assets/js/main.04c7dc1d.js (search it for
 * `PartnerOrder__Orders-V4` / `PositionItem__Orders-V4` / `Address__Orders-V4`
 * / `Amount__Orders-V4`). That is the source for every field below.
 *
 * `PartnerOrder__Orders-V4` properties: `salesOrderId`, `orderNumber`,
 * `orderDate`, `lastModifiedDate`, `orderLifecycleInformation` (nested;
 * only field is `lifecycleChangeDate`), `payment.paymentMethod`,
 * `positionItems[]`, `deliveryAddress`, `invoiceAddress`,
 * `initialDeliveryFees[]`, `initialDiscounts[]`, `suspectedFraudCase`.
 * There is NO order-level `fulfillmentStatus` and NO order-level `currency`
 * — both are derived below from `positionItems`, never invented.
 *
 * `PositionItem__Orders-V4` properties: `positionItemId`, `fulfillmentStatus`
 * (ANNOUNCED | PROCESSABLE | SENT | RETURNED | CANCELLED_BY_PARTNER |
 * CANCELLED_BY_MARKETPLACE), `cancellationDate`, `cancellationReason`,
 * `expectedDeliveryDate`, `processableDate`, `dealId`, `dealName`,
 * `itemValueGrossPrice` / `itemValueReducedGrossPrice` / `itemValueDiscount`
 * (each an `Amount__Orders-V4`: `{ amount: number, currency: string }`,
 * `amount` in MAJOR units — the spec's own example is `15.99`), `product`
 * (`Product__Orders-V4`: `sku`, `productTitle`, `articleNumber`, `ean`,
 * `vatRate`). There is NO `quantity` property on `PositionItem` — the
 * schema's own description of `PartnerOrder.positionItems` says "multiple
 * position items can refer to the same product", i.e. one item IS one unit;
 * `quantity` is fixed at 1 here, not invented per record.
 *
 * `Address__Orders-V4` properties: `firstName`, `lastName`, `salutation`,
 * `street`, `houseNumber`, `addition`, `zipCode`, `city`, `countryCode`
 * (ISO-3166-1 **Alpha-3**, e.g. `"DEU"` — NOT the Alpha-2 the canonical
 * `AddressSchema.country` requires), `email`, `phoneNumber`.
 * `ALPHA3_TO_ALPHA2` converts the codes OTTO Market realistically ships to;
 * an unmapped code is left off rather than guessed.
 *
 * Orders are buyer-initiated — the seller API documents no order-creation
 * endpoint, so `createOrder`/`updateOrder` are not implemented (index.ts).
 *
 * Every timestamp in the spec's own examples (e.g. `orderDate`:
 * `"2021-03-31T09:45:52.313+0000"`) uses a bare `+HHMM` offset with no
 * colon — Java's default `OffsetDateTime` rendering. `@opensteward/shared`'s
 * `IsoDatetime` requires the colon (`+00:00`), so `normaliseOttoDate` inserts
 * one rather than let every real order fail schema validation.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/orders
 *       https://api.otto.market/docs/assets/js/main.04c7dc1d.js
 */

import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export type RawOttoFulfillmentStatus =
  | 'ANNOUNCED'
  | 'PROCESSABLE'
  | 'SENT'
  | 'RETURNED'
  | 'CANCELLED_BY_PARTNER'
  | 'CANCELLED_BY_MARKETPLACE'
  | (string & {})

/** `Amount__Orders-V4` — `amount` is a MAJOR-unit decimal (spec example: `15.99`). */
export interface RawOttoAmount {
  amount: number
  currency: string
}

/** `Product__Orders-V4`. */
export interface RawOttoProduct {
  sku?: string
  productTitle?: string
  articleNumber?: string
  ean?: string
  vatRate?: number
}

/** `Address__Orders-V4`. `countryCode` is ISO-3166-1 Alpha-3. */
export interface RawOttoAddress {
  firstName?: string
  lastName?: string
  salutation?: string
  street?: string
  houseNumber?: string
  addition?: string
  zipCode?: string
  city?: string
  countryCode?: string
  email?: string
  phoneNumber?: string
}

/** `PositionItem__Orders-V4`. No `quantity` property exists on this schema. */
export interface RawOttoPositionItem {
  positionItemId: string
  fulfillmentStatus?: RawOttoFulfillmentStatus
  cancellationDate?: string
  cancellationReason?: string
  itemValueGrossPrice?: RawOttoAmount
  itemValueReducedGrossPrice?: RawOttoAmount
  itemValueDiscount?: RawOttoAmount
  product?: RawOttoProduct
  [key: string]: unknown
}

/** `PartnerOrder__Orders-V4`. */
export interface RawOttoOrder {
  salesOrderId: string
  orderNumber?: string
  orderDate?: string
  lastModifiedDate?: string
  orderLifecycleInformation?: { lifecycleChangeDate?: string }
  deliveryAddress?: RawOttoAddress
  invoiceAddress?: RawOttoAddress
  positionItems?: RawOttoPositionItem[]
  [key: string]: unknown
}

const CANCELLED_STATES = new Set(['CANCELLED_BY_PARTNER', 'CANCELLED_BY_MARKETPLACE'])

/** `+0000` / `+0200` → `+00:00` / `+02:00`. Leaves `Z` and already-colon offsets untouched. */
function normaliseOttoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
}

function mapFulfillmentStatus(status: RawOttoFulfillmentStatus | undefined): OrderFulfillmentStatus {
  switch (status) {
    case 'ANNOUNCED':
    case 'PROCESSABLE':
      return 'UNFULFILLED'
    case 'SENT':
      return 'FULFILLED'
    case 'RETURNED':
      return 'RESTOCKED'
    default:
      return 'unknown'
  }
}

/**
 * No order-level `fulfillmentStatus` exists in `PartnerOrder__Orders-V4` —
 * only `positionItems[].fulfillmentStatus`. Aggregate rather than invent:
 * all items shipped → FULFILLED, some → PARTIAL, none → UNFULFILLED,
 * anything else (mixed with cancelled/returned) → unknown.
 */
function deriveOrderFulfillmentStatus(items: RawOttoPositionItem[]): OrderFulfillmentStatus | undefined {
  if (items.length === 0) return undefined
  const mapped = items.map((i) => mapFulfillmentStatus(i.fulfillmentStatus))
  if (mapped.every((s) => s === 'FULFILLED')) return 'FULFILLED'
  if (mapped.some((s) => s === 'FULFILLED')) return 'PARTIAL'
  if (mapped.every((s) => s === 'UNFULFILLED')) return 'UNFULFILLED'
  return 'unknown'
}

/** ISO-3166-1 Alpha-3 → Alpha-2 for the countries OTTO Market (a German/EU marketplace) realistically ships to. */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  DEU: 'DE', AUT: 'AT', CHE: 'CH', NLD: 'NL', BEL: 'BE', FRA: 'FR', GBR: 'GB',
  POL: 'PL', ITA: 'IT', ESP: 'ES', DNK: 'DK', SWE: 'SE', NOR: 'NO', FIN: 'FI',
  CZE: 'CZ', LUX: 'LU', PRT: 'PT', IRL: 'IE', HUN: 'HU', SVK: 'SK', SVN: 'SI',
  HRV: 'HR', GRC: 'GR', ROU: 'RO', BGR: 'BG', LTU: 'LT', LVA: 'LV', EST: 'EE',
  USA: 'US',
}

function mapAddress(raw: RawOttoAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = [raw.street, raw.houseNumber].filter((v): v is string => Boolean(v)).join(' ')
  const country = raw.countryCode ? ALPHA3_TO_ALPHA2[raw.countryCode.toUpperCase()] : undefined
  return {
    line1: line1 || undefined,
    line2: raw.addition,
    city: raw.city,
    postalCode: raw.zipCode,
    country,
  }
}

/**
 * Canonical `LineItem.price` is the unit price before discounts, with the
 * discount reported separately in `totalDiscount`. So the gross price is the
 * price and `itemValueDiscount` the discount. Only when OTTO sends no gross
 * price does the reduced price stand in, and then no discount is reported,
 * because it is already applied and would otherwise be subtracted twice.
 */
function pickAmount(item: RawOttoPositionItem): { base: RawOttoAmount; discountApplies: boolean } | undefined {
  if (item.itemValueGrossPrice) return { base: item.itemValueGrossPrice, discountApplies: true }
  if (item.itemValueReducedGrossPrice) return { base: item.itemValueReducedGrossPrice, discountApplies: false }
  return undefined
}

/**
 * `undefined` when the item carries neither `itemValueGrossPrice` nor
 * `itemValueReducedGrossPrice` — the position item is then dropped from
 * `lineItems` by the caller (the field is optional on `Order`) rather than
 * published with an invented price. `quantity` is always 1 — see file
 * header — never a guessed or defaulted-to-zero count.
 */
function mapLineItem(raw: RawOttoPositionItem): LineItem | undefined {
  const picked = pickAmount(raw)
  if (!picked) return undefined
  const rawAmount = picked.base
  const price = { amount: majorToMinor(rawAmount.amount, rawAmount.currency), currency: rawAmount.currency.toUpperCase() }
  const discount = picked.discountApplies && raw.itemValueDiscount
    ? { amount: majorToMinor(raw.itemValueDiscount.amount, raw.itemValueDiscount.currency), currency: raw.itemValueDiscount.currency.toUpperCase() }
    : undefined

  return {
    id: raw.positionItemId,
    title: raw.product?.productTitle ?? raw.product?.sku ?? raw.positionItemId,
    sku: raw.product?.sku,
    quantity: 1,
    price,
    totalDiscount: discount,
    fulfillmentStatus: raw.fulfillmentStatus ? mapFulfillmentStatus(raw.fulfillmentStatus) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawOttoOrder): Order {
  const rawItems = raw.positionItems ?? []
  const lineItems = rawItems.map(mapLineItem).filter((li): li is LineItem => li != null)
  const cancelledItem = rawItems.find(
    (li) => li.fulfillmentStatus && CANCELLED_STATES.has(li.fulfillmentStatus),
  )

  return {
    id: raw.salesOrderId,
    orderNumber: raw.orderNumber,
    name: raw.orderNumber ?? raw.salesOrderId,
    email: raw.deliveryAddress?.email,
    phone: raw.deliveryAddress?.phoneNumber,
    // No order-level currency field exists; a real line-item currency is not
    // a fabrication, it is read straight from the payload.
    currency: lineItems[0]?.price.currency,
    fulfillmentStatus: deriveOrderFulfillmentStatus(rawItems),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapAddress(raw.deliveryAddress),
    billingAddress: mapAddress(raw.invoiceAddress),
    createdAt: normaliseOttoDate(raw.orderDate),
    updatedAt: normaliseOttoDate(raw.lastModifiedDate),
    processedAt: normaliseOttoDate(raw.orderDate),
    cancelledAt: normaliseOttoDate(cancelledItem?.cancellationDate),
    cancelReason: cancelledItem?.cancellationReason,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
