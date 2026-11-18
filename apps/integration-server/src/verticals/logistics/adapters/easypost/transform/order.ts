import type { Order } from '../../../schema/order'
import { toISODate, nonempty } from '../../shared/transform'
import { transformAddress, type EasyPostAddress } from './address'
import type { EasyPostRate } from './rate'
import type { EasyPostShipment } from './shipment'

export interface EasyPostOrder {
  id: string
  object: 'Order'
  reference: string | null
  mode: string
  to_address: EasyPostAddress | null
  from_address: EasyPostAddress | null
  return_address: EasyPostAddress | null
  buyer_address: EasyPostAddress | null
  shipments: EasyPostShipment[]
  rates: EasyPostRate[]
  messages: unknown[]
  is_return: boolean
  options: Record<string, unknown>
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformOrder(raw: EasyPostOrder): Order {
  const shipmentIds = nonempty((raw.shipments ?? []).map((s) => s.id))

  return {
    id: raw.id,
    orderNumber: raw.reference ?? undefined,
    originAddress: raw.from_address ? transformAddress(raw.from_address) : undefined,
    destinationAddress: raw.to_address ? transformAddress(raw.to_address) : undefined,
    shipmentIds,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
