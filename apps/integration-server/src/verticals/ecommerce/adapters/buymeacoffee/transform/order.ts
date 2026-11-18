/**
 * Buy Me a Coffee Supporter / Subscription → canonical Order.
 *
 * Buy Me a Coffee surfaces two transaction types:
 *
 *  1. **Supporter** (one-time tip) — `GET /supporters`.
 *     One supporter object = one "coffee" purchase (possibly multiple units).
 *
 *  2. **Subscription** (recurring membership) — `GET /subscriptions`.
 *     One subscription object = one active membership period.
 *
 * Both are mapped to canonical Orders so callers get a unified view of all
 * revenue through the standard `listOrders` / `getOrder` surface.
 *
 * Supporter key mapping:
 *  - `support_id`            → canonical `id` + `orderNumber`
 *  - `payer_name`            → canonical `name`
 *  - `payer_email`           → canonical `email`
 *  - `support_coffees`       → line item `quantity`
 *  - `support_coffee_price`  → line item unit price
 *  - `support_currency`      → canonical `currency`
 *  - `support_note`          → canonical `note`
 *  - `transaction_id`        → `transactionIds`
 *  - `support_created_on`    → canonical `createdAt`
 *  - `support_updated_on`    → canonical `updatedAt`
 *  - `is_refunded`           → `financialStatus` (REFUNDED vs PAID)
 *  - Always `fulfillmentStatus: 'FULFILLED'` (digital, instant delivery)
 *
 * Subscription key mapping:
 *  - `subscription_id`              → canonical `id` + `orderNumber`
 *  - `subscriber_name`              → canonical `name`
 *  - `subscriber_email`             → canonical `email`
 *  - `subscription_coffee_num`      → line item `quantity`
 *  - `subscription_coffee_price`    → line item unit price
 *  - `subscription_currency`        → canonical `currency`
 *  - `membership_level_name`        → tag + line item title
 *  - `subscription_created_on`      → canonical `createdAt`
 *  - `subscription_updated_on`      → canonical `updatedAt`
 *  - `subscription_is_cancelled`    → tag when true
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from '../constants'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface BmacSupporter {
  support_id: number
  support_note?: string | null
  support_coffees?: number | null
  transaction_id?: string | null
  support_visibility?: number | null
  support_created_on?: string | null
  support_updated_on?: string | null
  transfer_id?: string | null
  supporter_name?: string | null
  supporter_email?: string | null
  support_coffee_price?: string | null
  support_email?: string | null
  support_currency?: string | null
  referer?: string | null
  is_refunded?: boolean
  payer_email?: string | null
  payer_name?: string | null
  [key: string]: unknown
}

export interface BmacSubscription {
  subscription_id: number
  subscription_created_on?: string | null
  subscription_updated_on?: string | null
  subscription_cancelled_on?: string | null
  subscription_current_period_start?: string | null
  subscription_current_period_end?: string | null
  subscription_coffee_num?: number | null
  subscription_coffee_price?: string | null
  subscription_currency?: string | null
  subscription_is_cancelled?: boolean
  subscription_is_cancelled_at_period_end?: boolean
  subscriber_email?: string | null
  subscriber_name?: string | null
  membership_level_id?: number | null
  membership_level_name?: string | null
  [key: string]: unknown
}

/** Discriminated union for the two BMAC order sources. */
export type BmacOrderSource =
  | { kind: 'supporter'; raw: BmacSupporter }
  | { kind: 'subscription'; raw: BmacSubscription }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a decimal price string to a Money object.
 */
export function parseAmount(
  price: string | null | undefined,
  currency: string,
): { amount: number; currency: string } | undefined {
  if (price == null || price === '') return undefined
  const parsed = parseFloat(price)
  if (isNaN(parsed)) return undefined
  return { amount: majorToMinor(parsed, currency), currency }
}

// ── Supporter transform ───────────────────────────────────────────────────────

function supporterFinancialStatus(raw: BmacSupporter): OrderFinancialStatus {
  return raw.is_refunded ? 'REFUNDED' : 'PAID'
}

function supporterLineItem(raw: BmacSupporter, currency: string): LineItem {
  const quantity = raw.support_coffees ?? 1
  const unitPrice = parseAmount(raw.support_coffee_price, currency) ?? {
    amount: 0,
    currency,
  }

  return {
    id: String(raw.support_id),
    title: 'Buy Me a Coffee — Tip',
    quantity,
    price: unitPrice,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Buy Me a Coffee supporter (one-time tip) → canonical Order.
 */
export function transformSupporter(raw: BmacSupporter): Order {
  const currency = raw.support_currency ?? DEFAULT_CURRENCY
  const quantity = raw.support_coffees ?? 1
  const unitPrice = parseAmount(raw.support_coffee_price, currency)
  const totalAmount =
    unitPrice != null
      ? { amount: unitPrice.amount * quantity, currency }
      : undefined

  const tags: string[] = ['supporter']
  if (raw.is_refunded) tags.push('refunded')

  const transactionIds: string[] = []
  if (raw.transaction_id) transactionIds.push(raw.transaction_id)

  return {
    id: String(raw.support_id),
    orderNumber: String(raw.support_id),
    name: raw.payer_name ?? raw.supporter_name ?? undefined,
    email: raw.payer_email ?? raw.supporter_email ?? raw.support_email ?? undefined,
    currency,
    totalPrice: totalAmount,
    financialStatus: supporterFinancialStatus(raw),
    fulfillmentStatus: 'FULFILLED' satisfies OrderFulfillmentStatus,
    lineItems: [supporterLineItem(raw, currency)],
    note: raw.support_note ?? undefined,
    tags,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    createdAt: toIsoDatetime(raw.support_created_on),
    updatedAt: toIsoDatetime(raw.support_updated_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Subscription transform ────────────────────────────────────────────────────

function subscriptionLineItem(raw: BmacSubscription, currency: string): LineItem {
  const quantity = raw.subscription_coffee_num ?? 1
  const unitPrice = parseAmount(raw.subscription_coffee_price, currency) ?? {
    amount: 0,
    currency,
  }
  const title = raw.membership_level_name
    ? `Buy Me a Coffee — ${raw.membership_level_name}`
    : 'Buy Me a Coffee — Membership'

  return {
    id: String(raw.subscription_id),
    title,
    quantity,
    price: unitPrice,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Buy Me a Coffee subscription (membership) → canonical Order.
 */
export function transformSubscription(raw: BmacSubscription): Order {
  const currency = raw.subscription_currency ?? DEFAULT_CURRENCY
  const quantity = raw.subscription_coffee_num ?? 1
  const unitPrice = parseAmount(raw.subscription_coffee_price, currency)
  const totalAmount =
    unitPrice != null
      ? { amount: unitPrice.amount * quantity, currency }
      : undefined

  const tags: string[] = ['subscription']
  if (raw.membership_level_name) tags.push(`tier:${raw.membership_level_name}`)
  if (raw.subscription_is_cancelled) tags.push('cancelled')
  if (raw.subscription_is_cancelled_at_period_end)
    tags.push('cancel_at_period_end')

  const financialStatus: OrderFinancialStatus = raw.subscription_is_cancelled
    ? 'VOIDED'
    : 'PAID'

  return {
    id: String(raw.subscription_id),
    orderNumber: String(raw.subscription_id),
    name: raw.subscriber_name ?? undefined,
    email: raw.subscriber_email ?? undefined,
    currency,
    totalPrice: totalAmount,
    financialStatus,
    fulfillmentStatus: 'FULFILLED' satisfies OrderFulfillmentStatus,
    lineItems: [subscriptionLineItem(raw, currency)],
    tags,
    createdAt: toIsoDatetime(raw.subscription_created_on),
    updatedAt: toIsoDatetime(raw.subscription_updated_on),
    cancelledAt: toIsoDatetime(raw.subscription_cancelled_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Dispatch a BmacOrderSource to the correct transform.
 *
 * This is the single entry-point used by the adapter when it has already
 * categorised the raw object.
 */
export function transformOrder(source: BmacOrderSource): Order {
  if (source.kind === 'supporter') return transformSupporter(source.raw)
  return transformSubscription(source.raw)
}
