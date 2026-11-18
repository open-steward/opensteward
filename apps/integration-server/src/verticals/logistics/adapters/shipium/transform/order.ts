import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Shipium `Order` — the schema searchOrdersV1 (`results[]`), getOrderV1 and
 * createOrderV1 return. Only fields in that schema are declared.
 * https://docs.shipium.com/reference/searchordersv1.md (components.schemas.Order)
 */
export interface ShipiumOrder {
  fulfillmentType?: string | null
  orderSource?: string | null
  tenantId?: string | null
  shipiumOrderId?: string | null
  partnerOrderId?: string | null
  orderedDateTime?: string | null
  orderItemQuantities?: ShipiumOrderItem[] | null
  associatedIdentifiers?: string[] | null
  shipOption?: string | null
  originId?: string | null
  shipFromAddress?: ShipiumCSAddress | null
  destinationAddress?: ShipiumCSAddress | null
  customsInfo?: unknown
  currencyCode?: string | null
  totalDeclaredValue?: unknown
  orderFulfillmentParameters?: unknown
  orderStatus?: string | null
  orderFulfillmentInfo?: {
    shipments?: Array<{ shipiumShipmentId?: string | null; [key: string]: unknown }> | null
    unfulfilledItems?: unknown
  } | null
  [key: string]: unknown
}

/** `OrderItem` — "A list of orderItems comprising the shipment." */
export interface ShipiumOrderItem {
  orderItemReferenceIdentifier?: string | null
  shipiumOrderId?: string | null
  partnerOrderId?: string | null
  productId?: string | null
  quantity?: number | null
  productDescription?: string | null
  [key: string]: unknown
}

/** `CSAddress` — "countryCode: The ISO 3166-1 country code for the address." */
export interface ShipiumCSAddress {
  name?: string | null
  phoneNumber?: string | null
  phoneNumberCountryCode?: string | null
  emailAddress?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  countryCode?: string | null
  postalCode?: string | null
  addressType?: string | null
  [key: string]: unknown
}

/**
 * searchOrdersV1 200 body — `OrchestratedAssetBatchResults`:
 * "results: Successful results from processing." / "failures: Any failures
 * resulting from processing."
 */
export interface ShipiumOrderSearchResults {
  orchestratedAssetMetadata?: unknown
  results?: ShipiumOrder[] | null
  failures?: unknown[] | null
}

/**
 * The documented `orderStatus` enum: open, open_split, complete,
 * complete_multiship, cancelled, partial_ship, error. `complete*` means every
 * item is "accounted for as shipping / shipped" (Pack App guide,
 * `splitParameters.fulfilled`); `error` has no canonical equivalent.
 */
function mapOrderStatus(status: string | null | undefined): OrderStatus | undefined {
  switch (status) {
    case undefined:
    case null:
      return undefined
    case 'open':
    case 'open_split':
      return 'PENDING'
    case 'partial_ship':
      return 'PROCESSING'
    case 'complete':
    case 'complete_multiship':
      return 'SHIPPED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

function transformCSAddress(raw: ShipiumCSAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const country = raw.countryCode ?? undefined
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street1 ?? undefined,
    street2: raw.street2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: country && /^[A-Z]{2}$/.test(country) ? (country as Address['country']) : undefined,
    phone: raw.phoneNumber ?? undefined,
    email: raw.emailAddress ?? undefined,
  }
}

export function transformOrder(raw: ShipiumOrder): Order {
  if (!raw.shipiumOrderId) throw new Error('Shipium order has no shipiumOrderId')
  const shipmentIds = (raw.orderFulfillmentInfo?.shipments ?? [])
    .map((s) => s.shipiumShipmentId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const currency = raw.currencyCode ?? undefined
  return {
    id: raw.shipiumOrderId,
    orderNumber: raw.partnerOrderId ?? undefined,
    status: mapOrderStatus(raw.orderStatus),
    warehouseId: raw.originId ?? undefined,
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    destinationAddress: transformCSAddress(raw.destinationAddress),
    originAddress: transformCSAddress(raw.shipFromAddress),
    lineItems: raw.orderItemQuantities?.map((item) => ({
      id: item.orderItemReferenceIdentifier ?? undefined,
      sku: item.productId ?? undefined,
      description: item.productDescription ?? undefined,
      quantity: item.quantity ?? undefined,
    })),
    currency:
      currency && /^[A-Za-z]{3}$/.test(currency)
        ? (currency.toUpperCase() as Order['currency'])
        : undefined,
    requestedServiceCode: raw.shipOption ?? undefined,
    orderAt: toISODate(raw.orderedDateTime),
    metadata: raw as Record<string, unknown>,
  }
}
