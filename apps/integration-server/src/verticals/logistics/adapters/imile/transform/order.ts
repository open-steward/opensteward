import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, nonempty } from '../../shared/transform'
import { transformAddress, type IMileAddress } from './address'

/**
 * iMile order object.
 * An iMile "order" is the merchant-level record that may contain one or more
 * waybills/shipments. The status vocabulary mirrors the shipment enum.
 */
export interface IMileOrder {
  /** iMile internal order identifier. */
  orderId?: string | null
  /** Merchant-facing order number / reference. */
  orderNo?: string | null
  status?: string | number | null
  statusDesc?: string | null
  senderAddress?: IMileAddress | null
  receiverAddress?: IMileAddress | null
  /** Associated waybill numbers. */
  waybillNos?: string[] | null
  currency?: string | null
  /** Total declared value (minor or major units depending on currency). */
  totalAmount?: number | string | null
  createdTime?: string | null
  updatedTime?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | number | null | undefined): OrderStatus {
  const s = String(status ?? '').toUpperCase()
  switch (s) {
    case 'PENDING':
    case 'CREATED':
    case '0':
      return 'PENDING'
    case 'PROCESSING':
    case '1':
      return 'PROCESSING'
    case 'AWAITING_SHIPMENT':
    case 'LABEL_CREATED':
    case '2':
      return 'AWAITING_SHIPMENT'
    case 'SHIPPED':
    case 'IN_TRANSIT':
    case '3':
      return 'SHIPPED'
    case 'DELIVERED':
    case '5':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'CANCELED':
    case '7':
      return 'CANCELLED'
    case 'RETURNED':
    case '6':
      return 'RETURNED'
    default:
      return 'PROCESSING'
  }
}

export function transformOrder(raw: IMileOrder): Order {
  return {
    id: raw.orderId ?? undefined,
    orderNumber: raw.orderNo ?? undefined,
    status: mapOrderStatus(raw.status),
    originAddress: raw.senderAddress ? transformAddress(raw.senderAddress) : undefined,
    destinationAddress: raw.receiverAddress ? transformAddress(raw.receiverAddress) : undefined,
    shipmentIds: nonempty(raw.waybillNos ?? undefined),
    currency: raw.currency ?? undefined,
    createdAt: toISODate(raw.createdTime),
    updatedAt: toISODate(raw.updatedTime),
    metadata: raw as Record<string, unknown>,
  }
}
