import type { Order } from '../../../schema/order'
import { toISODate, nonempty } from '../../shared/transform'
import { transformAddress, type SendParcelAddress } from './address'
import type { SendParcelShipment } from './shipment'

/**
 * SendParcel order object as returned by the REST API.
 */
export interface SendParcelOrder {
  id?: string | null
  reference?: string | null
  status?: string | null
  customerId?: string | null
  warehouseId?: string | null
  senderAddress?: SendParcelAddress | null
  receiverAddress?: SendParcelAddress | null
  shipments?: SendParcelShipment[] | null
  currency?: string | null
  totalAmount?: number | null
  shippingAmount?: number | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformOrder(raw: SendParcelOrder): Order {
  const shipmentIds = nonempty((raw.shipments ?? []).map((s) => s.id).filter((id): id is string => !!id))

  return {
    id: raw.id ?? undefined,
    orderNumber: raw.reference ?? undefined,
    customerId: raw.customerId ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    originAddress: raw.senderAddress ? transformAddress(raw.senderAddress) : undefined,
    destinationAddress: raw.receiverAddress ? transformAddress(raw.receiverAddress) : undefined,
    shipmentIds,
    currency: raw.currency ?? undefined,
    totalAmount: raw.totalAmount ?? undefined,
    shippingAmount: raw.shippingAmount ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
