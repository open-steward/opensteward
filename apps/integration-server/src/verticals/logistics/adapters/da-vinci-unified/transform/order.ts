import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface DaVinciOrderItem {
  ItemId?: string | number | null
  SKU?: string | null
  Description?: string | null
  Quantity?: number | null
  UnitPrice?: number | null
  TotalPrice?: number | null
  Weight?: number | null
  WeightUOM?: string | null
  [key: string]: unknown
}

export interface DaVinciOrder {
  OrderId?: string | number | null
  OrderKey?: string | null
  OrderNumber?: string | null
  Status?: string | null
  CustomerId?: string | number | null
  CustomerCode?: string | null
  WarehouseId?: string | number | null
  ShipToAddress?: Record<string, unknown> | null
  ShipFromAddress?: Record<string, unknown> | null
  Items?: DaVinciOrderItem[]
  ShipmentIds?: Array<string | number>
  Notes?: string | null
  RequestedServiceCode?: string | null
  OrderDate?: string | null
  ShippedDate?: string | null
  DeliveredDate?: string | null
  CancelledDate?: string | null
  SubTotal?: number | null
  TaxAmount?: number | null
  ShippingAmount?: number | null
  DiscountAmount?: number | null
  TotalAmount?: number | null
  Currency?: string | null
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

export function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'New':
    case 'Pending':
      return 'PENDING'
    case 'Processing':
    case 'Picking':
    case 'Packing':
      return 'PROCESSING'
    case 'OnHold':
    case 'On Hold':
    case 'Hold':
      return 'ON_HOLD'
    case 'ReadyToShip':
    case 'Ready to Ship':
    case 'AwaitingShipment':
      return 'AWAITING_SHIPMENT'
    case 'Shipped':
    case 'InTransit':
      return 'SHIPPED'
    case 'Delivered':
      return 'DELIVERED'
    case 'Cancelled':
    case 'Canceled':
      return 'CANCELLED'
    case 'Returned':
    case 'ReturnReceived':
      return 'RETURNED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: DaVinciOrder): Order {
  const id = raw.OrderId != null ? String(raw.OrderId) : (raw.OrderKey ?? undefined)
  const shipmentIds = nonempty((raw.ShipmentIds ?? []).map((s) => String(s)))

  const lineItems = nonempty(
    (raw.Items ?? []).map((item) => ({
      id: item.ItemId != null ? String(item.ItemId) : undefined,
      sku: item.SKU ?? undefined,
      description: item.Description ?? undefined,
      quantity: item.Quantity ?? undefined,
      unitAmount: item.UnitPrice ?? undefined,
      totalAmount: item.TotalPrice ?? undefined,
    })),
  )

  return {
    id,
    status: mapOrderStatus(raw.Status),
    orderNumber: raw.OrderNumber ?? raw.OrderKey ?? undefined,
    customerId:
      raw.CustomerId != null
        ? String(raw.CustomerId)
        : (raw.CustomerCode ?? undefined),
    warehouseId: raw.WarehouseId != null ? String(raw.WarehouseId) : undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    shipmentIds,
    lineItems,
    currency: raw.Currency ?? undefined,
    subtotalAmount: raw.SubTotal ?? undefined,
    taxAmount: raw.TaxAmount ?? undefined,
    shippingAmount: raw.ShippingAmount ?? undefined,
    discountAmount: raw.DiscountAmount ?? undefined,
    totalAmount: raw.TotalAmount ?? undefined,
    notes: raw.Notes ?? undefined,
    requestedServiceCode: raw.RequestedServiceCode ?? undefined,
    orderAt: toISODate(raw.OrderDate),
    shippedAt: toISODate(raw.ShippedDate),
    deliveredAt: toISODate(raw.DeliveredDate),
    cancelledAt: toISODate(raw.CancelledDate),
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
