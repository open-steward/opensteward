/**
 * Tray Order → canonical.
 *
 * Verified with curl against developers.tray.com.br (see `client.ts`
 * header):
 *
 *   - LIST (`#listagem-de-pedidos-get`): `GET /orders?access_token=`,
 *     filters `id, dc_id, status, partner_id, limit, page, sort, modified`.
 *     Response: `{paging:{...}, ..., Orders:[{Order:{status, id, date,
 *     customer_id, total, has_payment, has_shipment, has_invoice, dc_id,
 *     OrderStatus:{type,...}, ProductsSold:[{id}], Payment:[], ...}}]}` —
 *     `ProductsSold` here is only ever `[{id}]`, no quantity/price/name, so
 *     it is NOT used to build line items from the list response.
 *   - GET (`#dados-do-pedido-get`): `GET /orders/:id?access_token=` →
 *     `{"Order": {...same shape, plus hour, delivered, payment_method,
 *     ...}}`.
 *   - GET COMPLETE (`#dados-completo-do-pedido-get`): `GET
 *     /orders/:id/complete?access_token=` → same `Order` shape, but with a
 *     genuinely detailed `ProductsSold:[{"ProductsSold": {id, product_id,
 *     variant_id, name, quantity, price, ...}}]` AND an embedded
 *     `"Customer": {id, name, email, cpf, phone, cellphone, ...}` (the full
 *     customer record, not just `customer_id`). This adapter's `getOrder`
 *     calls `/complete` specifically to get this richer, still-documented
 *     shape rather than the thinner plain-get one.
 *   - CREATE (`#cadastrar-pedido-post`): `POST /orders?access_token=`,
 *     bracket-form body nests BOTH the customer AND the line items under
 *     `Order.Customer` — quoted verbatim from the docs' own curl example:
 *     `["Order"]["Customer"]["ProductsSold"][0]["product_id"]=1`. This is
 *     unusual (line items conceptually belong to the order, not the
 *     customer) but it is exactly what the documented example shows, so it
 *     is followed as-is rather than "corrected". Response:
 *     `{"message":"Created","id":...,"code":201}`.
 *   - UPDATE (`#atualizar-dados-do-pedido-put`): `PUT /orders/:id
 *     ?access_token=`, bracket-form body: status_id, taxes, shipment,
 *     shipment_value, discount, sending_code, sending_date, tracking_url,
 *     store_note, customer_note, partner_id.
 *   - CANCEL (`#cancelar-pedido-put`): `PUT /orders/cancel/:id
 *     ?access_token=`, no body — note the id sits BEFORE the verb segment
 *     here, unlike every other Tray write path in this file
 *     (`/orders/:id`); a prior draft guessed `/orders/:id/cancel`, which is
 *     wrong.
 *
 * Status mapping is intentionally narrow. The only two `status` STRING
 * values ever shown in a documented example are `"A ENVIAR"` and
 * `"FINALIZADO"` (no enum table exists anywhere on the page) — those two,
 * and only those two, are mapped; everything else is left unmapped rather
 * than guessed at from Portuguese vocabulary. Separately, `has_payment` is
 * a genuinely documented boolean flag (not a string to interpret) and is
 * used for `financialStatus`, which is a different, unambiguous signal.
 */
import type { Order, OrderFinancialStatus, OrderFulfillmentStatus, LineItem } from '../../../schema/order'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

export interface RawTrayProductsSoldDetailed {
  id: number | string
  product_id?: number | string
  variant_id?: number | string
  name?: string
  quantity?: number | string
  price?: string | number
}

export type RawTrayProductsSoldEntry = { id: number | string } | { ProductsSold: RawTrayProductsSoldDetailed }

export interface RawTrayOrderCustomer {
  id?: number | string
  email?: string
}

export interface RawTrayOrder {
  id: number | string
  status?: string
  date?: string
  modified?: string
  customer_id?: number | string
  total?: string | number
  has_payment?: string | number | boolean
  Customer?: RawTrayOrderCustomer
  ProductsSold?: RawTrayProductsSoldEntry[]
  [key: string]: unknown
}

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(Number.isFinite(n) ? n : 0, currency)
}

function isTruthyFlag(v: string | number | boolean | undefined): boolean | undefined {
  if (v == null) return undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = v.trim().toLowerCase()
  if (s === '') return undefined
  return s === '1' || s === 'true'
}

/** `has_payment` is a documented boolean flag, not a status string — see file header. */
function mapFinancialStatus(hasPayment: string | number | boolean | undefined): OrderFinancialStatus | undefined {
  const truthy = isTruthyFlag(hasPayment)
  if (truthy === undefined) return undefined
  return truthy ? 'PAID' : 'PENDING'
}

/** Only the two `status` strings ever shown in a documented example — see file header. */
function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus | undefined {
  if (status === 'A ENVIAR') return 'UNFULFILLED'
  if (status === 'FINALIZADO') return 'FULFILLED'
  return undefined
}

function transformLineItem(entry: RawTrayProductsSoldEntry, currency: string): LineItem | undefined {
  if (!('ProductsSold' in entry)) return undefined
  const raw = entry.ProductsSold
  if (!raw.name) return undefined
  const quantity = typeof raw.quantity === 'string' ? parseInt(raw.quantity, 10) : (raw.quantity ?? 0)
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null && raw.variant_id !== '0' ? String(raw.variant_id) : undefined,
    title: raw.name,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    price: { amount: toMoneyAmount(raw.price, currency), currency },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawTrayOrder, currency: string = DEFAULT_CURRENCY): Order {
  const lineItems = (raw.ProductsSold ?? [])
    .map((e) => transformLineItem(e, currency))
    .filter((li): li is LineItem => li !== undefined)

  return {
    id: String(raw.id),
    customerId:
      raw.Customer?.id != null
        ? String(raw.Customer.id)
        : raw.customer_id != null
          ? String(raw.customer_id)
          : undefined,
    email: raw.Customer?.email ?? undefined,
    currency,
    totalPrice: raw.total != null ? { amount: toMoneyAmount(raw.total, currency), currency } : undefined,
    financialStatus: mapFinancialStatus(raw.has_payment),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    // `date` (date-only, e.g. "2025-02-06") and `modified` (space-separated,
    // no timezone, e.g. "2025-02-06 09:57:58") are both documented but
    // neither satisfies canonical `IsoDatetime`, and Tray's docs never state
    // a timezone — left unmapped rather than guessing one (see
    // transform/product.ts header). Raw strings survive in `metadata`.
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → Tray order-create body (bracket-form POST `/orders`,
 * wrapped as `Order` by the caller). Follows the documented — if unusual —
 * nesting of line items under `Customer`; see file header.
 */
export function untransformOrderForCreate(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const customer: Record<string, unknown> = {}
  if (order.email) customer.email = order.email
  if (order.lineItems && order.lineItems.length > 0) {
    customer.ProductsSold = order.lineItems.map((li) => ({
      product_id: li.productId,
      variant_id: li.variantId,
      price: minorToMajor(li.price.amount, li.price.currency),
      quantity: li.quantity,
    }))
  }
  if (Object.keys(customer).length > 0) body.Customer = customer
  return body
}

/** Canonical Order → Tray order-update body (bracket-form PUT `/orders/:id`, wrapped as `Order` by the caller). */
export function untransformOrderForUpdate(order: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (order.totalShipping) body.shipment_value = minorToMajor(order.totalShipping.amount, order.totalShipping.currency)
  if (order.totalTax) body.taxes = minorToMajor(order.totalTax.amount, order.totalTax.currency)
  if (order.totalDiscounts) body.discount = minorToMajor(order.totalDiscounts.amount, order.totalDiscounts.currency)
  if (order.note) body.store_note = order.note
  return body
}
