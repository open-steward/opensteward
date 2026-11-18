import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface LogiwaOrderItem {
  SKU: string
  Quantity: number
  Description?: string | null
  UnitPrice?: number | null
  [key: string]: unknown
}

export interface LogiwaOrder {
  OrderID: string | number
  OrderCode?: string | null
  Status?: string | null
  CustomerID?: string | number | null
  WarehouseID?: string | number | null
  ShipToAddress?: Record<string, unknown> | null
  ShipFromAddress?: Record<string, unknown> | null
  Items?: LogiwaOrderItem[]
  ShipmentIDs?: Array<string | number>
  Notes?: string | null
  ServiceCode?: string | null
  OrderDate?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  [key: string]: unknown
}

export function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'New':
    case 'Pending':            return 'PENDING'
    case 'Processing':         return 'PROCESSING'
    case 'On Hold':            return 'ON_HOLD'
    case 'Awaiting Shipment':  return 'AWAITING_SHIPMENT'
    case 'Shipped':            return 'SHIPPED'
    case 'Delivered':          return 'DELIVERED'
    case 'Cancelled':          return 'CANCELLED'
    case 'Returned':           return 'RETURNED'
    default:                   return 'PENDING'
  }
}

export function transformOrder(raw: LogiwaOrder): Order {
  const shipmentIds = nonempty((raw.ShipmentIDs ?? []).map((s) => String(s)))

  const lineItems = nonempty(
    (raw.Items ?? []).map((item) => ({
      sku: item.SKU,
      quantity: item.Quantity,
      description: item.Description ?? undefined,
      unitAmount: item.UnitPrice ?? undefined,
    })),
  )

  return {
    id: String(raw.OrderID),
    status: mapOrderStatus(raw.Status),
    orderNumber: raw.OrderCode ?? undefined,
    customerId: raw.CustomerID != null ? String(raw.CustomerID) : undefined,
    warehouseId: raw.WarehouseID != null ? String(raw.WarehouseID) : undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    shipmentIds,
    lineItems,
    notes: raw.Notes ?? undefined,
    requestedServiceCode: raw.ServiceCode ?? undefined,
    orderAt: toISODate(raw.OrderDate),
    createdAt: toISODate(raw.CreatedAt),
    updatedAt: toISODate(raw.UpdatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
