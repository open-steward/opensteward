/**
 * Virto Commerce CustomerOrder → canonical Order.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Orders/swagger.json` →
 * `components.schemas.CustomerOrder` / `OrderAddress` / `OrderLineItem` /
 * `PaymentIn`. See the matching test file header for the exact verified
 * shapes and the reasoning behind the `financialStatus`/`fulfillmentStatus`
 * derivation. `currency` is nullable on `CustomerOrder` per the schema, so
 * it (and every money field derived from it) is left unset rather than
 * defaulted when absent.
 */
import type { Order, OrderFinancialStatus, OrderFulfillmentStatus, LineItem } from '../../../schema/order'
import type { Address, Money } from '../../../schema/shared'

export interface RawVirtoOrderAddress {
  addressType?: 'Undefined' | 'Billing' | 'Shipping' | 'BillingAndShipping' | 'Pickup'
  line1?: string
  line2?: string
  city?: string
  regionName?: string
  postalCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface RawVirtoOrderLineItem {
  id: string
  productId?: string
  sku?: string
  name?: string
  quantity?: number
  placedPrice?: number
  [key: string]: unknown
}

export interface RawVirtoPaymentIn {
  id: string
  paymentStatus?:
    | 'New' | 'Pending' | 'Authorized' | 'Paid' | 'PartiallyRefunded' | 'Refunded'
    | 'Voided' | 'Custom' | 'Cancelled' | 'Declined' | 'Error'
  [key: string]: unknown
}

export interface RawVirtoOrderShipment {
  id: string
  status?: string
  [key: string]: unknown
}

export interface RawVirtoCustomerOrder {
  id: string
  number?: string
  customerId?: string
  currency?: string
  status?: string
  total?: number
  subTotal?: number
  taxTotal?: number
  discountTotal?: number
  isCancelled?: boolean
  cancelledDate?: string
  cancelReason?: string
  addresses?: RawVirtoOrderAddress[]
  items?: RawVirtoOrderLineItem[]
  inPayments?: RawVirtoPaymentIn[]
  shipments?: RawVirtoOrderShipment[]
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function money(value: number | null | undefined, currency: string | undefined): Money | undefined {
  if (value == null || currency == null) return undefined
  return { amount: Math.round(value * 100), currency }
}

function toAddress(raw: RawVirtoOrderAddress): Address {
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.city,
    region: raw.regionName,
    postalCode: raw.postalCode,
    country: raw.countryCode,
  }
}

const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  New: 'PENDING',
  Pending: 'PENDING',
  Authorized: 'AUTHORIZED',
  Paid: 'PAID',
  PartiallyRefunded: 'PARTIALLY_REFUNDED',
  Refunded: 'REFUNDED',
  Voided: 'VOIDED',
  Cancelled: 'VOIDED',
}

function financialStatus(raw: RawVirtoCustomerOrder): OrderFinancialStatus {
  if (raw.isCancelled) return 'VOIDED'
  const payments = raw.inPayments ?? []
  if (payments.length === 0) return 'PENDING'
  const latest = payments[payments.length - 1]!
  return PAYMENT_STATUS_MAP[latest.paymentStatus ?? ''] ?? 'unknown'
}

/**
 * `shipments[].status` (and the order's own `status`) are free-text,
 * per-store-configurable workflow statuses with no fixed vocabulary — see
 * the test file header. Only the presence/absence of shipments is a fact we
 * can state with confidence.
 */
function fulfillmentStatus(raw: RawVirtoCustomerOrder): OrderFulfillmentStatus {
  return (raw.shipments?.length ?? 0) === 0 ? 'UNFULFILLED' : 'unknown'
}

/**
 * `LineItem.quantity`/`.price` are required on the canonical schema. Both
 * come from real, non-nullable fields on `OrderLineItem` per the swagger,
 * so a record missing either — or an order with items but no `currency` to
 * price them in — is malformed data this throws on rather than papering
 * over with a fabricated quantity or a `{ amount: 0 }` price.
 */
function lineItems(raw: RawVirtoCustomerOrder, currency: string | undefined): LineItem[] | undefined {
  if (!raw.items || raw.items.length === 0) return undefined
  if (currency == null) {
    throw new Error(`Virto Commerce order ${raw.id} has line items but no currency to price them in`)
  }
  return raw.items.map((item) => {
    if (item.quantity == null || item.placedPrice == null) {
      throw new Error(`Virto Commerce order ${raw.id} line item ${item.id} has no quantity/placedPrice`)
    }
    return {
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      title: item.name ?? item.sku ?? item.id,
      quantity: item.quantity,
      price: { amount: Math.round(item.placedPrice * 100), currency },
      metadata: { ...item },
    }
  })
}

export function transformOrder(raw: RawVirtoCustomerOrder): Order {
  const currency = raw.currency
  const billing = raw.addresses?.find(
    (a) => a.addressType === 'Billing' || a.addressType === 'BillingAndShipping',
  )
  const shipping = raw.addresses?.find(
    (a) => a.addressType === 'Shipping' || a.addressType === 'BillingAndShipping',
  )
  return {
    id: raw.id,
    orderNumber: raw.number,
    name: raw.number,
    customerId: raw.customerId,
    currency,
    subtotalPrice: money(raw.subTotal, currency),
    totalTax: money(raw.taxTotal, currency),
    totalDiscounts: money(raw.discountTotal, currency),
    totalPrice: money(raw.total, currency),
    financialStatus: financialStatus(raw),
    fulfillmentStatus: fulfillmentStatus(raw),
    lineItems: lineItems(raw, currency),
    billingAddress: billing ? toAddress(billing) : undefined,
    shippingAddress: shipping ? toAddress(shipping) : undefined,
    fulfillmentIds: raw.shipments?.map((s) => s.id),
    transactionIds: raw.inPayments?.map((p) => p.id),
    createdAt: raw.createdDate,
    updatedAt: raw.modifiedDate,
    cancelledAt: raw.cancelledDate,
    cancelReason: raw.cancelReason,
    metadata: { ...raw },
  }
}
