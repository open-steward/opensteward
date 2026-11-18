import type { Order } from '../../../schema/order'
import { parseDecimal, nonempty } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'
import { transformAddress, type FrenetAddress } from './address'

/**
 * Frenet order record returned from GET /orders and GET /orders/{id}.
 */
export interface FrenetOrder {
  OrderId?: string | null
  OrderNumber?: string | null
  /** Platform-provided store order ID */
  PlatformOrderId?: string | null
  ShipmentIds?: string[] | null
  Status?: string | null
  Carrier?: string | null
  CarrierCode?: string | null
  TrackingNumber?: string | null
  ServiceDescription?: string | null
  /** Total weight in kg */
  Weight?: number | string | null
  /** Invoice (declared) value in BRL */
  InvoiceValue?: number | string | null
  /** Shipping cost in BRL */
  ShippingPrice?: number | string | null
  DestinationAddress?: FrenetAddress | null
  OriginAddress?: FrenetAddress | null
  CreatedDate?: string | null
  UpdatedDate?: string | null
  [key: string]: unknown
}

export function transformOrder(raw: FrenetOrder): Order {
  const shippingPrice = parseDecimal(raw.ShippingPrice)

  return {
    id: raw.OrderId ?? undefined,
    orderNumber: raw.OrderNumber ?? raw.PlatformOrderId ?? undefined,
    originAddress: transformAddress(raw.OriginAddress),
    destinationAddress: transformAddress(raw.DestinationAddress),
    shipmentIds: nonempty(raw.ShipmentIds ?? []),
    totalAmount: shippingPrice != null ? shippingPrice : undefined,
    currency: shippingPrice != null ? 'BRL' : undefined,
    createdAt: toIsoDatetime(raw.CreatedDate) ? new Date(toIsoDatetime(raw.CreatedDate)!) : undefined,
    updatedAt: toIsoDatetime(raw.UpdatedDate) ? new Date(toIsoDatetime(raw.UpdatedDate)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
