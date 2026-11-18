/**
 * Marketplacer Invoice → canonical Order transform.
 *
 * Sellers query Invoices, not Orders: "sellers are not permitted to query
 * [the Order] object and will get a permissions error" — see
 * docs/seller-api/examples/orders/invoices ("How to query orders" /
 * "Order permissions"). This adapter therefore never selects `Invoice.order`
 * and treats the Invoice itself as the canonical Order — read-only (no
 * `orderCreate` exists in the Seller API's mutation set: `advertUpsert`,
 * `refundRequestCreate`, `shipmentCreate`).
 *
 * `Invoice.lineItems` is not requested: the confirmed fields for it
 * (`id`, `variantId`/`variantName`) carry no per-line price, and
 * `LineItem.price` is required by the canonical schema — fabricating a price
 * would be worse than omitting the (optional) `lineItems` array entirely.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/examples/orders/invoices/
 *       https://api.marketplacer.com/docs/seller-api/reference/queries/invoices/
 */
import type { Order } from '../../../schema/order'

export interface RawMarketplacerInvoice {
  id: string
  legacyId?: number
  createdAt?: string
  updatedAt?: string
  paidAt?: string | null
  totalCents?: number | null
  statusFlags?: string[]
  [key: string]: unknown
}

function financialStatus(flags: string[]): Order['financialStatus'] {
  if (flags.includes('REFUNDED')) return 'REFUNDED'
  if (flags.includes('PARTIALLY_SENT') || flags.includes('PAID')) return 'PAID'
  return 'PENDING'
}

function fulfillmentStatus(flags: string[]): Order['fulfillmentStatus'] {
  if (flags.includes('SENT')) return 'FULFILLED'
  if (flags.includes('PARTIALLY_SENT') || flags.includes('AWAITING_RETURN')) return 'PARTIAL'
  return 'UNFULFILLED'
}

/**
 * `totalCents` is exactly what its name says regardless of the instance's
 * actual currency (Marketplacer does not report a currency on Invoice at
 * all), so no major/minor conversion is needed here — only the `currency`
 * label is required, supplied by the caller from the connection (the
 * `currency` field collected in ./connect-form.ts). There is no platform
 * default to fall back to.
 */
export function transformOrder(raw: RawMarketplacerInvoice, currency: string): Order {
  if (!currency) {
    throw new Error('transformOrder requires a currency — Marketplacer reports no currency of its own.')
  }
  const flags = raw.statusFlags ?? []
  return {
    id: String(raw.id),
    orderNumber: raw.legacyId != null ? String(raw.legacyId) : undefined,
    name: raw.legacyId != null ? `#${raw.legacyId}` : undefined,
    currency,
    totalPrice: raw.totalCents != null ? { amount: raw.totalCents, currency } : undefined,
    financialStatus: financialStatus(flags),
    fulfillmentStatus: fulfillmentStatus(flags),
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    processedAt: raw.paidAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
