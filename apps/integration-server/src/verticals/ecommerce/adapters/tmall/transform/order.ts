/**
 * Tmall / TOP trade → canonical Order.
 *
 * TOP returns "trades" (trades = orders). The `taobao.trades.sold.get`
 * endpoint returns paginated trade summaries; `taobao.trade.fullinfo.get`
 * returns a single trade with nested `orders` (order lines / sub-orders).
 *
 * TOP status values (status field):
 *   TRADE_NO_CREATE_PAY  → buyer created but not paid
 *   WAIT_BUYER_PAY       → waiting for buyer payment
 *   WAIT_SELLER_SEND_GOODS → paid, waiting for shipping
 *   WAIT_BUYER_CONFIRM_GOODS → shipped, awaiting confirmation
 *   TRADE_FINISHED       → completed
 *   TRADE_CLOSED         → closed (cancelled)
 *   TRADE_CLOSED_BY_TAOBAO → closed by platform
 *
 * Financial status mapping:
 *   WAIT_BUYER_PAY + TRADE_NO_CREATE_PAY → PENDING
 *   WAIT_SELLER_SEND_GOODS / WAIT_BUYER_CONFIRM_GOODS → PAID
 *   TRADE_FINISHED → PAID
 *   TRADE_CLOSED* → VOIDED
 *
 * Fulfillment status mapping:
 *   WAIT_BUYER_PAY / TRADE_NO_CREATE_PAY → UNFULFILLED
 *   WAIT_SELLER_SEND_GOODS → UNFULFILLED
 *   WAIT_BUYER_CONFIRM_GOODS → PARTIAL
 *   TRADE_FINISHED → FULFILLED
 *   TRADE_CLOSED* → UNFULFILLED
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTmallSubOrder {
  oid?: string | number
  num_iid?: string | number
  title?: string
  sku_id?: string | number
  outer_sku_id?: string
  price?: string
  payment?: string
  total_fee?: string
  num?: number
  pic_path?: string
  status?: string
  outer_iid?: string
  [key: string]: unknown
}

export interface RawTmallTrade {
  tid?: string | number
  status?: string
  type?: string
  buyer_nick?: string
  buyer_email?: string
  receiver_name?: string
  receiver_phone?: string
  receiver_mobile?: string
  receiver_state?: string
  receiver_city?: string
  receiver_district?: string
  receiver_address?: string
  receiver_zip?: string
  payment?: string
  post_fee?: string
  discount_fee?: string
  created?: string
  modified?: string
  end_time?: string
  pay_time?: string
  /** Sub-orders (order lines) — present in fullinfo response. */
  orders?: {
    order?: RawTmallSubOrder[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNumber(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Map a TOP trade status to canonical financial status.
 */
export function mapFinancialStatus(
  status: string | undefined,
): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'WAIT_BUYER_PAY':
    case 'TRADE_NO_CREATE_PAY':
      return 'PENDING'
    case 'WAIT_SELLER_SEND_GOODS':
    case 'WAIT_BUYER_CONFIRM_GOODS':
    case 'TRADE_FINISHED':
      return 'PAID'
    case 'TRADE_CLOSED':
    case 'TRADE_CLOSED_BY_TAOBAO':
      return 'VOIDED'
    default:
      return undefined
  }
}

/**
 * Map a TOP trade status to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'TRADE_NO_CREATE_PAY':
    case 'WAIT_BUYER_PAY':
    case 'WAIT_SELLER_SEND_GOODS':
      return 'UNFULFILLED'
    case 'WAIT_BUYER_CONFIRM_GOODS':
      return 'PARTIAL'
    case 'TRADE_FINISHED':
      return 'FULFILLED'
    case 'TRADE_CLOSED':
    case 'TRADE_CLOSED_BY_TAOBAO':
      return 'UNFULFILLED'
    default:
      return undefined
  }
}

function buildShippingAddress(raw: RawTmallTrade): Address | undefined {
  if (!raw.receiver_address && !raw.receiver_city) return undefined
  return {
    line1: raw.receiver_address,
    city: raw.receiver_city,
    region: raw.receiver_state,
    postalCode: raw.receiver_zip,
    country: 'CN',
  }
}

function extractLineItems(raw: RawTmallTrade, currency: string): LineItem[] | undefined {
  const subOrders: RawTmallSubOrder[] = raw.orders?.order ?? []
  if (subOrders.length === 0) return undefined

  return subOrders.map((o) => {
    const unitPrice = parseNumber(o.payment ?? o.price ?? o.total_fee)
    const qty = o.num ?? 1
    return {
      id: String(o.oid ?? ''),
      productId: o.num_iid ? String(o.num_iid) : undefined,
      variantId: o.sku_id ? String(o.sku_id) : undefined,
      title: o.title ?? '',
      quantity: qty,
      price: { amount: unitPrice, currency },
      sku: o.outer_sku_id ?? (o.outer_iid ? String(o.outer_iid) : undefined),
      metadata: o as unknown as Record<string, unknown>,
    }
  })
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * TOP trade → canonical Order.
 *
 * `tid` becomes the canonical `id`. Sub-orders become line items.
 * The complete raw trade object is stored in `metadata`.
 */
export function transformOrder(raw: RawTmallTrade, currency = 'CNY'): Order {
  const isClosed =
    raw.status === 'TRADE_CLOSED' || raw.status === 'TRADE_CLOSED_BY_TAOBAO'

  const lineItems = extractLineItems(raw, currency)

  return {
    id: String(raw.tid ?? ''),
    orderNumber: String(raw.tid ?? ''),
    currency,
    email: raw.buyer_email ?? undefined,
    phone: raw.receiver_mobile ?? raw.receiver_phone ?? undefined,
    totalPrice:
      raw.payment != null ? { amount: parseNumber(raw.payment), currency } : undefined,
    totalShipping:
      raw.post_fee != null ? { amount: parseNumber(raw.post_fee), currency } : undefined,
    totalDiscounts:
      raw.discount_fee != null && raw.discount_fee !== '0.00'
        ? { amount: parseNumber(raw.discount_fee), currency }
        : undefined,
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: lineItems ?? undefined,
    shippingAddress: buildShippingAddress(raw),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.modified),
    processedAt: toIsoDatetime(raw.pay_time),
    cancelledAt: isClosed ? (raw.end_time ?? raw.modified) : undefined,
    cancelReason: isClosed ? raw.status : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
