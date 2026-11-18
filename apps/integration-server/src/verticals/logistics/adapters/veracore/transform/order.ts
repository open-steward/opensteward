import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface VeraCoreOrderItem {
  ItemID?: string | number | null
  SKU?: string | null
  Quantity?: number | null
  Description?: string | null
  UnitPrice?: number | null
  [key: string]: unknown
}

/**
 * Raw VeraCore order as returned by GET /v1/orders/{id} or listed in
 * GET /v1/orders.
 */
export interface VeraCoreOrder {
  OrderID: string | number
  OrderNumber?: string | null
  /** VeraCore order lifecycle status string */
  Status?: string | null
  CustomerID?: string | number | null
  WarehouseID?: string | number | null
  ShipToAddress?: Record<string, unknown> | null
  ShipFromAddress?: Record<string, unknown> | null
  Items?: VeraCoreOrderItem[]
  ShipmentIDs?: Array<string | number>
  Notes?: string | null
  RequestedServiceCode?: string | null
  ServiceCode?: string | null
  OrderDate?: string | null
  ShippedDate?: string | null
  DeliveredDate?: string | null
  CancelledDate?: string | null
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

export interface VeraCoreOrderListResponse {
  Orders?: VeraCoreOrder[]
  TotalCount?: number | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'New':
    case 'Pending':
    case 'Received':
      return 'PENDING'
    case 'Processing':
    case 'In Process':
    case 'Wave Released':
      return 'PROCESSING'
    case 'On Hold':
    case 'Hold':
      return 'ON_HOLD'
    case 'Awaiting Shipment':
    case 'Packed':
    case 'Ready to Ship':
      return 'AWAITING_SHIPMENT'
    case 'Shipped':
    case 'Partially Shipped':
      return 'SHIPPED'
    case 'Delivered':
      return 'DELIVERED'
    case 'Cancelled':
    case 'Canceled':
      return 'CANCELLED'
    case 'Returned':
    case 'Return Received':
      return 'RETURNED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: VeraCoreOrder): Order {
  const shipmentIds = nonempty((raw.ShipmentIDs ?? []).map((s) => String(s)))

  const lineItems = nonempty(
    (raw.Items ?? []).map((item) => ({
      sku: item.SKU ?? undefined,
      quantity: item.Quantity ?? undefined,
      description: item.Description ?? undefined,
      unitAmount: item.UnitPrice ?? undefined,
    })),
  )

  return {
    id: String(raw.OrderID),
    status: mapOrderStatus(raw.Status),
    orderNumber: raw.OrderNumber ?? undefined,
    customerId: raw.CustomerID != null ? String(raw.CustomerID) : undefined,
    warehouseId: raw.WarehouseID != null ? String(raw.WarehouseID) : undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    shipmentIds,
    lineItems,
    notes: raw.Notes ?? undefined,
    requestedServiceCode: raw.RequestedServiceCode ?? raw.ServiceCode ?? undefined,
    orderAt: toISODate(raw.OrderDate),
    shippedAt: toISODate(raw.ShippedDate),
    deliveredAt: toISODate(raw.DeliveredDate),
    cancelledAt: toISODate(raw.CancelledDate),
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
