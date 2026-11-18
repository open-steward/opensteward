/**
 * Ozon FBS posting → canonical Order.
 *
 * An Ozon order may be split into several postings, and the posting is what
 * the Seller API lets a seller list (`/v3/posting/fbs/list`), fetch
 * (`/v3/posting/fbs/get`) and cancel (`/v2/posting/fbs/cancel`) — so the
 * posting is the canonical Order, keyed by `posting_number`, with the parent
 * `order_number` kept as `orderNumber`.
 *
 * Nothing is invented: a line item needs a numeric `price` and a
 * `currency_code`; if any product lacks either, `lineItems` is omitted rather
 * than published short. Timestamps without a zone are not promoted (see
 * ../dates.ts). Buyer details are not mapped — FBS postings usually carry
 * `customer: null`. The raw posting is always in `metadata`.
 *
 * Docs: https://docs.ozon.ru/api/seller/ (FBS)
 */
import type { LineItem, Order, OrderFulfillmentStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'
import { isoIfZoned } from '../dates'

export interface RawOzonPostingProduct {
  sku: number
  offer_id: string
  name: string
  quantity: number
  /** Decimal major units as a string, e.g. `"1390.000000"`. */
  price: string
  currency_code?: string
  [key: string]: unknown
}

export interface RawOzonCancellation {
  cancel_reason?: string
  cancel_reason_id?: number
  [key: string]: unknown
}

export interface RawOzonPosting {
  posting_number: string
  order_id?: number
  order_number?: string
  status?: string
  substatus?: string
  in_process_at?: string
  products?: RawOzonPostingProduct[]
  cancellation?: RawOzonCancellation | null
  [key: string]: unknown
}

/** Documented FBS posting statuses, by what they mean for fulfilment. */
const NOT_YET_SHIPPED = new Set([
  'awaiting_registration',
  'acceptance_in_progress',
  'awaiting_approve',
  'awaiting_verification',
  'awaiting_packaging',
  'awaiting_deliver',
])
const SHIPPED = new Set(['sent_by_seller', 'driver_pickup', 'delivering', 'delivered'])
const CANCELLED = new Set(['cancelled', 'cancelled_from_split_pending'])

function fulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  if (status === undefined) return undefined
  if (NOT_YET_SHIPPED.has(status)) return 'UNFULFILLED'
  if (SHIPPED.has(status)) return 'FULFILLED'
  return 'unknown'
}

const DECIMAL = /^-?\d+(?:\.\d+)?$/
const CURRENCY = /^[A-Z]{3}$/

function lineItem(posting: string, p: RawOzonPostingProduct): LineItem | undefined {
  const currency = p.currency_code
  if (!currency || !CURRENCY.test(currency) || !DECIMAL.test(p.price)) return undefined
  if (!Number.isInteger(p.quantity) || p.quantity < 0) return undefined
  return {
    id: `${posting}:${p.sku}`,
    variantId: p.offer_id,
    sku: p.offer_id,
    title: p.name,
    quantity: p.quantity,
    price: { amount: majorToMinor(Number(p.price), currency), currency },
    metadata: p as unknown as Record<string, unknown>,
  }
}

function lineItems(raw: RawOzonPosting): LineItem[] | undefined {
  if (!raw.products) return undefined
  const mapped: LineItem[] = []
  for (const product of raw.products) {
    const item = lineItem(raw.posting_number, product)
    if (!item) return undefined
    mapped.push(item)
  }
  return mapped
}

export function transformOrder(raw: RawOzonPosting): Order {
  const items = lineItems(raw)
  const currencies = new Set((items ?? []).map((i) => i.price.currency))
  const cancelReason = raw.cancellation?.cancel_reason

  return {
    id: raw.posting_number,
    name: raw.posting_number,
    orderNumber: raw.order_number || undefined,
    currency: currencies.size === 1 ? [...currencies][0] : undefined,
    fulfillmentStatus: fulfillmentStatus(raw.status),
    lineItems: items,
    createdAt: isoIfZoned(raw.in_process_at),
    cancelReason: raw.status && CANCELLED.has(raw.status) && cancelReason ? cancelReason : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
