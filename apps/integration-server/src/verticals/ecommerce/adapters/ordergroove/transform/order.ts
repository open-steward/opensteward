/**
 * Ordergroove Order → canonical Order.
 *
 * An Ordergroove "Order" is a subscription-order EVENT — the record OG
 * creates when a subscription is due, that it hands to the merchant's
 * ecommerce platform to actually place — not a full commerce order. It has
 * no line items or addresses of its own in the response body;
 * `shipping_address` and `payment` are opaque ids into Ordergroove's
 * Addresses/Payments resources (out of scope for this adapter).
 *
 * `currency_code` IS a real, documented field — confirmed via the full
 * Response Body Definitions table at
 * https://developer.ordergroove.com/reference/orders-retrieve ("currency_code
 * · string · Three letter ISO currency code · "USD""). An earlier version of
 * this adapter asserted no currency field existed and defaulted to a
 * hardcoded USD; that was wrong — the table just wasn't rendered by the tool
 * used to check it the first time. `currency` and every money field are now
 * read from `currency_code`, and are all omitted together (not defaulted)
 * on the (undocumented, so far unobserved) case where a record has no
 * `currency_code` — the canonical schema allows this since every one of
 * these fields is optional.
 *
 * `id` is Ordergroove's `public_id` — confirmed by
 * https://developer.ordergroove.com/reference/orders-cancel, whose example
 * request path embeds the exact same value the retrieve example returns as
 * `public_id` (`PATCH /orders/{public_id}/cancel/`).
 *
 * Status codes confirmed at
 * https://developer.ordergroove.com/reference/order-status-codes.
 */
import type { Order, OrderFinancialStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawOrdergrooveOrder {
  merchant?: string
  customer?: string
  payment?: string | null
  shipping_address?: string | null
  public_id: string
  currency_code?: string | null
  sub_total?: string | number | null
  tax_total?: string | number | null
  shipping_total?: string | number | null
  discount_total?: string | number | null
  total?: string | number | null
  created?: string
  updated?: string
  place?: string | null
  cancelled?: string | null
  status?: number
  type?: number
  order_merchant_id?: string | null
  rejected_message?: string | null
  extra_data?: unknown
  locked?: boolean
  oos_free_shipping?: boolean
  [key: string]: unknown
}

/** https://developer.ordergroove.com/reference/order-status-codes */
const FINANCIAL_STATUS_BY_CODE: Record<number, OrderFinancialStatus> = {
  1: 'PENDING', // UNSENT — scheduled, not yet attempted
  5: 'PAID', // SUCCESS
  4: 'VOIDED', // CANCELLED
  3: 'VOIDED', // REJECTED — retry limit reached
  6: 'PENDING', // SEND_NOW
  9: 'PENDING', // PENDING_BATCH_RESPONSE
  10: 'PENDING', // PENDING_VERIFICATION
  11: 'PENDING', // PENDING_PLACEMENT
}

function mapFinancialStatus(status: number | undefined): OrderFinancialStatus | undefined {
  if (status == null) return undefined
  return FINANCIAL_STATUS_BY_CODE[status] ?? 'unknown'
}

function toNum(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

export function transformOrder(raw: RawOrdergrooveOrder): Order {
  const currency = raw.currency_code ?? undefined
  // No currency, no money fields — Money requires both `amount` and
  // `currency` together, and inventing one to attach a real amount to would
  // misreport the actual value.
  const money = (v: string | number | null | undefined) => {
    if (!currency) return undefined
    const n = toNum(v)
    return n == null ? undefined : { amount: majorToMinor(n, currency), currency }
  }

  return {
    id: raw.public_id,
    customerId: raw.customer ?? undefined,
    currency,
    subtotalPrice: money(raw.sub_total),
    totalTax: money(raw.tax_total),
    totalDiscounts: money(raw.discount_total),
    totalShipping: money(raw.shipping_total),
    totalPrice: money(raw.total),
    financialStatus: mapFinancialStatus(raw.status),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    processedAt: toIsoDatetime(raw.place ?? undefined),
    cancelledAt: toIsoDatetime(raw.cancelled ?? undefined),
    cancelReason: raw.rejected_message || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
