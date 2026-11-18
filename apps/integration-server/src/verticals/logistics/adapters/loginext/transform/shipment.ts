import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { loginextDate, loginextOrderNo, type LoginextOrder } from './order'

/**
 * The Order Get `status` values (its status filter table) on the shipment
 * lifecycle. NOTPICKEDUP is "marked as Attempted Pickup" and NOTDELIVERED
 * "marked Attempted Delivered"; NOTCOMPLETED is a first-mile NOTPICKEDUP or a
 * last-mile "PICKEDUP but NOTDELIVERED" order, so all three are EXCEPTION.
 */
export function mapShipmentStatus(status: string | null | undefined): ShipmentStatus | undefined {
  if (status == null || status === '') return undefined
  switch (status) {
    case 'NOTDISPATCHED':
      return 'PENDING'
    case 'PICKEDUP':
    case 'INTRANSIT':
      return 'IN_TRANSIT'
    case 'DELIVERED':
    case 'COMPLETED':
      return 'DELIVERED'
    case 'NOTPICKEDUP':
    case 'NOTDELIVERED':
    case 'NOTCOMPLETED':
      return 'EXCEPTION'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

/**
 * A row of the Order Get API as a canonical Shipment. LogiNext calls the
 * delivery order a "shipment" in its own paths (`/ShipmentApp/mile/v1/shipment`),
 * so both resources read the same row, keyed by the same order number.
 */
export function transformShipment(raw: LoginextOrder): Shipment {
  return {
    id: loginextOrderNo(raw),
    status: mapShipmentStatus(raw.status),
    trackingNumber:
      typeof raw.awbNumber === 'string' && raw.awbNumber !== '' ? raw.awbNumber : undefined,
    estimatedDeliveryAt: loginextDate(raw.deliverEta),
    notes: typeof raw.notes === 'string' && raw.notes !== '' ? raw.notes : undefined,
    createdAt: loginextDate(raw.shipmentOrderDt),
    metadata: raw as Record<string, unknown>,
  }
}
