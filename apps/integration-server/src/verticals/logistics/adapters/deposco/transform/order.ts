/**
 * Deposco customer order → canonical Order.
 *
 * Source: `CustomerOrderResponseDTO`, returned by
 *   GET /orders/customerOrders          ("Get a list of customer orders")
 *   GET /orders/customerOrders/{orderId} ("Get a customer order")
 * in https://auth.deposco.com/public/spec?version=latest.
 *
 * Only documented fields are read. Money is not mapped: `total`, `subTotal`,
 * `taxTotal`, `shippingTotal` and the line `unitPrice`/`lineTotal` are doubles
 * in major units ("total": 10 with "currencyCode": "USD" in the documented
 * example), while the canonical amounts are integer minor units; the raw
 * values stay in `metadata`.
 */
import type { Order, OrderStatus } from '../../../schema/order'
import {
  selfId,
  toDate,
  toDeposcoAddress,
  type DeposcoAddressFields,
  type DeposcoEntityRef,
} from '../dto'

/** The contact DTOs of a customer order: address fields plus these. */
export interface DeposcoOrderContact extends DeposcoAddressFields {
  /** "First name of the contact person for an address." */
  firstName?: string | null
  /** "Last name of the contact person for an address." */
  lastName?: string | null
  phone?: string | null
  email?: string | null
}

export interface DeposcoCustomerOrderLine {
  self?: DeposcoEntityRef | null
  /** "Number of the item on the order line." */
  itemNumber?: string | null
  /** "Text that describes the order line or the item on the order line." */
  description?: string | null
  /** "Quantity of the item that was ordered." (double) */
  orderQuantity?: number | null
  [key: string]: unknown
}

export interface DeposcoCustomerOrder {
  /** `self.id` is the `{orderId}` of GET /orders/customerOrders/{orderId}. */
  self?: DeposcoEntityRef | null
  /** "Number that uniquely identifies the customer order." */
  number?: string | null
  /** "Status of the customer order." (documented enum, see mapStatus) */
  status?: string | null
  /** "Date and time that the order was originally placed by the customer." */
  placedDate?: string | null
  shipToContact?: DeposcoOrderContact | null
  shipFromContact?: DeposcoOrderContact | null
  /** "Shipping service that is used to ship the order." */
  shipVia?: string | null
  /** "Array of order lines for the customer order." (a paginated sub-resource) */
  coLines?: { data?: DeposcoCustomerOrderLine[] | null } | null
  /** "Date and time that the customer order was created." */
  createdDate?: string | null
  /** "Date and time that the customer order was last updated." */
  updatedDate?: string | null
  [key: string]: unknown
}

/**
 * The documented status enum: "Back Ordered", "Complete", "New", "Canceled",
 * "Voided", "Incomplete", "Closed", "Open", "Sourced", "Allocating",
 * "Partially Allocated", "Allocated", "Partially InFulfillment",
 * "InFulfillment", "Partially Released", "Released", "Review", "Accepted",
 * "Draft", "Template", "Rejected", "Future".
 *
 * The spec defines none of them, so only the self-describing ones are mapped.
 * "Complete" and "Closed" do not say whether the order shipped or was
 * delivered, and fall through to `unknown`.
 */
function mapStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'New':
    case 'Open':
    case 'Draft':
    case 'Template':
    case 'Future':
    case 'Review':
    case 'Accepted':
    case 'Incomplete':
      return 'PENDING'
    case 'Sourced':
    case 'Allocating':
    case 'Partially Allocated':
    case 'Allocated':
    case 'Partially InFulfillment':
    case 'InFulfillment':
    case 'Partially Released':
    case 'Released':
      return 'PROCESSING'
    case 'Back Ordered':
      return 'ON_HOLD'
    case 'Canceled':
    case 'Voided':
    case 'Rejected':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

function contactAddress(c: DeposcoOrderContact | null | undefined) {
  if (!c) return undefined
  const name = [c.firstName, c.lastName].filter((p) => !!p).join(' ')
  return toDeposcoAddress(c, { name: name || undefined, phone: c.phone, email: c.email })
}

export function transformOrder(raw: DeposcoCustomerOrder): Order {
  const lines = (raw.coLines?.data ?? []).map((line) => ({
    id: selfId(line.self),
    sku: line.itemNumber || undefined,
    description: line.description || undefined,
    quantity:
      typeof line.orderQuantity === 'number' &&
      Number.isInteger(line.orderQuantity) &&
      line.orderQuantity >= 0
        ? line.orderQuantity
        : undefined,
  }))

  return {
    id: selfId(raw.self),
    status: mapStatus(raw.status),
    orderNumber: raw.number || undefined,
    originAddress: contactAddress(raw.shipFromContact),
    destinationAddress: contactAddress(raw.shipToContact),
    lineItems: lines.length > 0 ? lines : undefined,
    requestedServiceCode: raw.shipVia || undefined,
    orderAt: toDate(raw.placedDate),
    createdAt: toDate(raw.createdDate),
    updatedAt: toDate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
