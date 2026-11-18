/**
 * Ko-fi Webhook Payload → canonical Order.
 *
 * Ko-fi represents all monetary transactions — tips ("Donation"), recurring
 * memberships ("Subscription"), shop purchases ("Shop Order"), and bespoke
 * work ("Commission") — as a single webhook payload shape. The adapter maps
 * each payload to one canonical Order, regardless of type.
 *
 * Key mapping:
 *  - `kofi_transaction_id` → canonical `id` + `orderNumber`
 *  - `from_name`           → canonical `name` (display name on order)
 *  - `email`               → canonical `email`
 *  - `amount` (string)     → canonical `totalPrice`
 *  - `currency`            → canonical `currency`
 *  - `type`                → `tags` so callers can filter by transaction kind
 *  - `message`             → canonical `note`
 *  - `timestamp`           → canonical `createdAt`
 *  - `shop_items`          → canonical `lineItems` (for Shop Order type)
 *  - All other fields      → `metadata`
 *
 * Financial status: Ko-fi fires the webhook on successful payment, so every
 * inbound payload is treated as `PAID`. Refunds are not surfaced via webhook.
 *
 * Fulfillment status: Ko-fi delivers digital goods instantly; all orders are
 * `FULFILLED` by the time the webhook fires.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { RawKofiShopItem } from './product'
import { transformShopItem } from './product'
import { DEFAULT_CURRENCY } from '../constants'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface KofiWebhookPayload {
  verification_token: string
  message_id?: string
  timestamp?: string
  type?: string
  is_public?: boolean
  from_name?: string
  message?: string | null
  amount?: string
  url?: string
  email?: string
  currency?: string
  is_subscription_payment?: boolean
  is_first_subscription_payment?: boolean
  kofi_transaction_id?: string
  shop_items?: RawKofiShopItem[] | null
  tier_name?: string | null
  shipping?: unknown | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a Ko-fi string amount ("3.00") into a canonical money object.
 */
export function parseAmount(
  amount: string | undefined,
  currency: string,
): { amount: number; currency: string } | undefined {
  if (!amount) return undefined
  const parsed = parseFloat(amount)
  if (isNaN(parsed)) return undefined
  return { amount: majorToMinor(parsed, currency), currency }
}

/**
 * Ko-fi fires webhooks only on successful payments → always PAID.
 */
export function mapFinancialStatus(_payload: KofiWebhookPayload): OrderFinancialStatus {
  return 'PAID'
}

/**
 * Ko-fi delivers digital goods at purchase time → always FULFILLED.
 */
export function mapFulfillmentStatus(_payload: KofiWebhookPayload): OrderFulfillmentStatus {
  return 'FULFILLED'
}

/**
 * Build canonical line items from a Ko-fi webhook payload.
 *
 * - Shop Order: one line item per `shop_items` entry.
 * - Donation / Subscription / Commission: a single synthetic line item
 *   representing the transaction amount.
 */
export function buildLineItems(payload: KofiWebhookPayload): LineItem[] {
  const currency = payload.currency ?? DEFAULT_CURRENCY
  const shopItems = payload.shop_items

  if (shopItems && shopItems.length > 0) {
    return shopItems.map((item) => {
      const product = transformShopItem(item)
      const unitTotal = parseAmount(payload.amount, currency)
      const unitPrice = unitTotal
        ? { amount: Math.round(unitTotal.amount / (item.quantity ?? 1)), currency }
        : { amount: 0, currency }

      return {
        id: item.direct_link_code,
        productId: item.direct_link_code,
        title: product.title,
        quantity: item.quantity ?? 1,
        price: unitPrice,
        metadata: item as unknown as Record<string, unknown>,
      } satisfies LineItem
    })
  }

  // Non-shop transactions: synthesise a single line item from the payload
  const txId = payload.kofi_transaction_id ?? payload.message_id ?? 'kofi-tx'
  const price = parseAmount(payload.amount, currency) ?? { amount: 0, currency }
  const title = payload.type === 'Subscription' && payload.tier_name
    ? `Ko-fi Subscription — ${payload.tier_name}`
    : payload.type === 'Commission'
    ? 'Ko-fi Commission'
    : 'Ko-fi Tip'

  return [
    {
      id: txId,
      title,
      quantity: 1,
      price,
      metadata: payload as unknown as Record<string, unknown>,
    },
  ]
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Ko-fi webhook payload → canonical Order.
 */
export function transformTransaction(raw: KofiWebhookPayload): Order {
  const currency = raw.currency ?? DEFAULT_CURRENCY
  const txId = raw.kofi_transaction_id ?? raw.message_id ?? 'unknown'
  const totalPrice = parseAmount(raw.amount, currency)
  const tags: string[] = []
  if (raw.type) tags.push(raw.type)
  if (raw.is_subscription_payment) tags.push('subscription_payment')
  if (raw.is_first_subscription_payment) tags.push('first_subscription_payment')

  return {
    id: txId,
    orderNumber: txId,
    name: raw.from_name ?? undefined,
    email: raw.email ?? undefined,
    currency,
    totalPrice,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: buildLineItems(raw),
    note: raw.message ?? undefined,
    tags: tags.length > 0 ? tags : undefined,
    createdAt: raw.timestamp ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
