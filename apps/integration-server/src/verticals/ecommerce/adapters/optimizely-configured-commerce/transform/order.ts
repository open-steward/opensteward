/**
 * Maps Optimizely Configured Commerce's `OrderModel` (Storefront API v1,
 * `GET /api/v1/orders/{id}` — confirmed returned bare, not wrapped) to/from
 * the canonical Order shape. Field names, including the billing/shipping
 * address property list, are taken verbatim from the published reference
 * (confirmed field-by-field, not inferred by analogy):
 * https://docs.developers.optimizely.com/configured-commerce/reference/ordersv1_getasync
 * https://docs.developers.optimizely.com/configured-commerce/reference/ordersv1_patchasync
 *
 * The billing/shipping address fields use a genuinely mixed naming
 * convention in Optimizely's own schema — `btAddress1`..`btAddress4` /
 * `btCompanyName` / `btCountry` alongside `billToCity` / `billToState` /
 * `billToPostalCode` for billing (and the `st`/`shipTo` mirror for
 * shipping) — this is not a guess, it is what the reference documents.
 * Only `Address1`/`Address2` map onto the canonical `line1`/`line2`; the
 * canonical Address has no line3/line4. `btCountry`/`stCountry` are not
 * mapped onto `address.country` because the reference does not state
 * whether they carry an ISO 3166-1 alpha-2 code (which the canonical field
 * requires) or a full country name.
 *
 * The OrderModel has no `customerId`/`accountId` foreign key — confirmed —
 * only `customerNumber`/`customerSequence` (codes, not relational keys), so
 * `customerId` is intentionally left unset rather than guessed.
 *
 * `status` (a free-text string, e.g. "Submitted") has no published enum, so
 * it is not mapped onto `financialStatus`/`fulfillmentStatus` — guessing an
 * enum value would be worse than leaving it unset with the raw string still
 * available in `metadata`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Order } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawOptimizelyOrder {
  id: string
  erpOrderNumber?: string | null
  webOrderNumber?: string | null
  orderDate?: string | null
  modifyDate?: string | null
  status?: string | null
  currencyCode?: string | null
  orderTotal?: number | null
  orderSubTotal?: number | null
  taxAmount?: number | null
  shippingCharges?: number | null
  notes?: string | null
  customerPO?: string | null
  btCompanyName?: string | null
  btAddress1?: string | null
  btAddress2?: string | null
  billToCity?: string | null
  billToState?: string | null
  billToPostalCode?: string | null
  btCountry?: string | null
  stCompanyName?: string | null
  stAddress1?: string | null
  stAddress2?: string | null
  shipToCity?: string | null
  shipToState?: string | null
  shipToPostalCode?: string | null
  stCountry?: string | null
  [key: string]: unknown
}

const CURRENCY_CODE = /^[A-Z]{3}$/

/** Build an Address only when at least one sub-field is present; otherwise `undefined`. */
function addressFrom(fields: Partial<Address>): Address | undefined {
  const hasAny = Object.values(fields).some((v) => v != null)
  return hasAny ? fields : undefined
}

export function transformOrder(raw: RawOptimizelyOrder): Order {
  const currency = raw.currencyCode && CURRENCY_CODE.test(raw.currencyCode) ? raw.currencyCode : undefined
  const money = (amount: number | null | undefined) =>
    currency && amount != null ? { amount: majorToMinor(amount, currency), currency } : undefined

  return {
    id: raw.id,
    orderNumber: raw.webOrderNumber ?? raw.erpOrderNumber ?? undefined,
    name: raw.webOrderNumber ?? undefined,
    currency,
    subtotalPrice: money(raw.orderSubTotal),
    totalTax: money(raw.taxAmount),
    totalShipping: money(raw.shippingCharges),
    totalPrice: money(raw.orderTotal),
    note: raw.notes ?? undefined,
    billingAddress: addressFrom({
      line1: raw.btAddress1 ?? undefined,
      line2: raw.btAddress2 ?? undefined,
      city: raw.billToCity ?? undefined,
      region: raw.billToState ?? undefined,
      postalCode: raw.billToPostalCode ?? undefined,
    }),
    shippingAddress: addressFrom({
      line1: raw.stAddress1 ?? undefined,
      line2: raw.stAddress2 ?? undefined,
      city: raw.shipToCity ?? undefined,
      region: raw.shipToState ?? undefined,
      postalCode: raw.shipToPostalCode ?? undefined,
    }),
    createdAt: toIsoDatetime(raw.orderDate),
    updatedAt: toIsoDatetime(raw.modifyDate),
    processedAt: toIsoDatetime(raw.orderDate),
    metadata: raw as Record<string, unknown>,
  }
}

/** `PATCH /api/v1/orders/{id}` writable fields per the published reference. */
export function untransformOrder(data: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.note !== undefined) body['notes'] = data.note
  if (data.totalTax) body['taxAmount'] = minorToMajor(data.totalTax.amount, data.totalTax.currency)
  if (data.totalShipping) {
    body['shippingCharges'] = minorToMajor(data.totalShipping.amount, data.totalShipping.currency)
  }
  return body
}
