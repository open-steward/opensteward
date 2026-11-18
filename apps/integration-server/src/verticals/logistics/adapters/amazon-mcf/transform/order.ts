import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface McfOrderItem {
  sellerSku: string
  sellerFulfillmentOrderItemId?: string
  quantity: number
  displayableComment?: string | null
  perUnitDeclaredValue?: { currencyCode?: string; value?: number } | null
  [key: string]: unknown
}

export interface McfFulfillmentShipment {
  amazonShipmentId?: string
  [key: string]: unknown
}

export interface McfOrder {
  sellerFulfillmentOrderId: string
  displayableOrderId?: string
  fulfillmentOrderStatus?: string | null
  destinationAddress?: Record<string, unknown> | null
  notificationEmails?: string[]
  shippingSpeedCategory?: string | null
  displayableOrderComment?: string | null
  displayableOrderDate?: string | null
  receivedDate?: string | null
  statusUpdatedDate?: string | null
  fulfillmentShipments?: McfFulfillmentShipment[]
  items?: McfOrderItem[]
  [key: string]: unknown
}

export function mapMcfOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'RECEIVED':
    case 'NEW':
      return 'PENDING'
    case 'PLANNING':
    case 'PROCESSING':
      return 'PROCESSING'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'COMPLETE':
    case 'COMPLETE_PARTIALLED':
      return 'SHIPPED'
    case 'INVALID':
    case 'UNFULFILLABLE':
      return 'ON_HOLD'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: McfOrder): Order {
  const shipmentIds = nonempty(
    (raw.fulfillmentShipments ?? [])
      .map((s) => s.amazonShipmentId)
      .filter((v): v is string => !!v),
  )

  const lineItems = nonempty(
    (raw.items ?? []).map((item) => ({
      sku: item.sellerSku,
      quantity: item.quantity,
      description: item.displayableComment ?? undefined,
      unitAmount: item.perUnitDeclaredValue?.value ?? undefined,
    })),
  )

  return {
    id: raw.sellerFulfillmentOrderId,
    status: mapMcfOrderStatus(raw.fulfillmentOrderStatus),
    orderNumber: raw.displayableOrderId ?? undefined,
    destinationAddress: toAddress(raw.destinationAddress ?? null),
    shipmentIds,
    lineItems,
    requestedServiceCode: raw.shippingSpeedCategory ?? undefined,
    notes: raw.displayableOrderComment ?? undefined,
    orderAt: toISODate(raw.displayableOrderDate),
    createdAt: toISODate(raw.receivedDate),
    updatedAt: toISODate(raw.statusUpdatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
