/**
 * Toast Orders API `Order` → canonical Order.
 *
 * GET /orders/v2/ordersBulk "Returns an array of `Order` objects containing
 * detailed information about all of the orders opened during a period of
 * time." GET /orders/v2/orders/{guid} returns one.
 * https://doc.toasttab.com/openapi/orders/operation/ordersBulkGet/
 *
 * Toast amounts are decimal numbers in the restaurant's currency (the
 * documented example has `"amount": 57.73`). No order, check, selection or
 * payment names that currency: the restaurant does, in the Restaurants API
 * `General.currencyCode` ("The ISO-4217 currency code used in this
 * restaurant"). The adapter reads it there and passes it in; without it every
 * money field (and so every line item, whose price is required) is omitted.
 */

import type { Order, LineItem, OrderFinancialStatus } from '../../../schema/order'
import type { Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { Iso4217Currency, toIsoDatetime } from '@opensteward/shared'
import { z } from 'zod'
import type { RawToastRestaurant } from './location'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawToastRef {
  guid: string
  entityType?: string
  externalId?: string | null
}

export interface RawToastSelection {
  guid: string
  entityType?: string
  item?: RawToastRef | null
  itemGroup?: RawToastRef | null
  displayName?: string | null
  quantity?: number
  selectionType?: string | null
  /** Net line price after discounts, quantity and modifiers. */
  price?: number | null
  preDiscountPrice?: number | null
  /** "The price of the menu item selection without any quantity, taxes, discounts, and modifier adjustments." */
  receiptLinePrice?: number | null
  tax?: number | null
  voided?: boolean | null
  [key: string]: unknown
}

export interface RawToastOrderPayment {
  guid: string
  refundStatus?: string | null
  [key: string]: unknown
}

export interface RawToastCheckCustomer {
  guid?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
}

export interface RawToastCheck {
  guid: string
  entityType?: string
  displayNumber?: string | null
  selections?: RawToastSelection[]
  payments?: RawToastOrderPayment[]
  customer?: RawToastCheckCustomer | null
  /** "The total calculated price of the check including discounts and service charges ... does not include gratuity or taxes." */
  amount?: number | null
  /** "The calculated tax amount. Includes service charge and item level taxes." */
  taxAmount?: number | null
  /** "The total calculated price of this check including discounts, taxes, and tip. Not affected by refunds." */
  totalAmount?: number | null
  /** `OPEN` | `PAID` | `CLOSED` */
  paymentStatus?: string | null
  voided?: boolean | null
  deleted?: boolean | null
  [key: string]: unknown
}

export interface RawToastOrder {
  guid: string
  entityType?: string
  displayNumber?: string | null
  checks?: RawToastCheck[]
  voided?: boolean | null
  voidDate?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  paidDate?: string | null
  /** "Set to `true` if this order is deleted. Response only." */
  deleted?: boolean | null
  [key: string]: unknown
}

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * The restaurant's currency from `RestaurantInfo.general.currencyCode`, or
 * undefined when it is absent or not an ISO 4217 code.
 */
export function restaurantCurrency(raw: RawToastRestaurant | undefined): string | undefined {
  const code = raw?.general?.currencyCode
  return Iso4217Currency.safeParse(code).success ? code : undefined
}

/** A Toast decimal amount as canonical Money, or undefined when either half is unknown. */
export function toastMoney(
  amount: number | null | undefined,
  currency: string | undefined,
): Money | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || currency === undefined)
    return undefined
  return { amount: majorToMinor(amount, currency), currency }
}

/** Sum of one documented field over checks, or undefined unless every check has it. */
function sumChecks(
  checks: RawToastCheck[],
  pick: (c: RawToastCheck) => number | null | undefined,
): number | undefined {
  if (checks.length === 0) return undefined
  let total = 0
  for (const c of checks) {
    const v = pick(c)
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
    total += v
  }
  return total
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check `paymentStatus`: "`OPEN` - There is an outstanding balance.",
 * "`PAID` - A credit card payment was applied, but the tip has not been
 * adjusted.", "`CLOSED` - There is no remaining amount due on this check."
 * Payment `refundStatus`: `NONE` | `PARTIAL` | `FULL`.
 */
function mapFinancialStatus(
  order: RawToastOrder,
  checks: RawToastCheck[],
): OrderFinancialStatus | undefined {
  if (order.voided === true) return 'VOIDED'
  const payments = checks.flatMap((c) => c.payments ?? [])
  if (payments.length > 0 && payments.every((p) => p.refundStatus === 'FULL')) return 'REFUNDED'
  if (payments.some((p) => p.refundStatus === 'FULL' || p.refundStatus === 'PARTIAL'))
    return 'PARTIALLY_REFUNDED'
  const statuses = checks.map((c) => c.paymentStatus)
  if (statuses.length === 0 || statuses.some((s) => s !== 'OPEN' && s !== 'PAID' && s !== 'CLOSED'))
    return undefined
  const paid = statuses.filter((s) => s === 'PAID' || s === 'CLOSED').length
  if (paid === statuses.length) return 'PAID'
  if (paid > 0) return 'PARTIALLY_PAID'
  return 'PENDING'
}

/**
 * A selection as a canonical line item, or undefined when it has no
 * documented value for a required field: a title (`displayName`), a whole
 * `quantity` ("For items sold by weight, a decimal number"), or a unit price
 * (`receiptLinePrice`) in a known currency. The raw selection stays in the
 * order's `metadata` either way.
 */
function mapLineItem(raw: RawToastSelection, currency: string | undefined): LineItem | undefined {
  const price = toastMoney(raw.receiptLinePrice, currency)
  const quantity = raw.quantity
  if (!price || typeof raw.displayName !== 'string' || raw.displayName === '') return undefined
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) return undefined
  return {
    id: raw.guid,
    productId: raw.item?.guid ?? undefined,
    title: raw.displayName,
    quantity,
    price,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function customerOf(checks: RawToastCheck[]): RawToastCheckCustomer | undefined {
  for (const c of checks) if (c.customer) return c.customer
  return undefined
}

const Email = z.email()

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawToastOrder, currency: string | undefined): Order {
  // Order.deleted: "Set to `true` if this order is deleted. Response only.
  // For example, if you combine a check into another order, the original
  // order for the check is deleted." Its checks are counted on the order they
  // moved to, so a deleted order contributes no totals, lines or payments.
  // Check.deleted: "Set to `true` if this check was deleted."
  const checks = raw.deleted === true ? [] : (raw.checks ?? []).filter((c) => c.deleted !== true)

  const lineItems = checks
    .flatMap((c) => c.selections ?? [])
    .filter((s) => s.voided !== true)
    .map((s) => mapLineItem(s, currency))
    .filter((li): li is LineItem => li !== undefined)

  const transactionIds = checks.flatMap((c) => c.payments ?? []).map((p) => p.guid)

  const customer = customerOf(checks)
  const email =
    customer?.email && Email.safeParse(customer.email).success ? customer.email : undefined

  return {
    id: raw.guid,
    orderNumber: raw.displayNumber ? raw.displayNumber : undefined,
    customerId: customer?.guid ?? undefined,
    email,
    phone: customer?.phone ? customer.phone : undefined,
    currency,
    totalPrice: toastMoney(
      sumChecks(checks, (c) => c.totalAmount),
      currency,
    ),
    totalTax: toastMoney(
      sumChecks(checks, (c) => c.taxAmount),
      currency,
    ),
    financialStatus: mapFinancialStatus(raw, checks),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    cancelledAt: raw.voided === true ? toIsoDatetime(raw.voidDate) : undefined,
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.modifiedDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Toast order body for create. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const lineItems = order.lineItems?.map((li) => ({
    itemGuid: li.variantId,
    displayName: li.title,
    quantity: li.quantity,
    price: li.price?.amount,
  }))

  return {
    diningOption: order.note ? { name: order.note } : undefined,
    checks: [
      {
        selections: lineItems,
        customer: order.customerId ? { guid: order.customerId } : undefined,
      },
    ],
  }
}
