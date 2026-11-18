import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'
import { transformAddress, type CdekLocation, type CdekContact } from './address'
import type { CdekOrder } from './shipment'

/**
 * Map CDEK status codes to canonical OrderStatus values.
 */
function mapOrderStatus(code: string | null | undefined): OrderStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'CREATED':
    case 'ACCEPTED':
      return 'PROCESSING'
    case 'RECEIVED_AT_SENDER_WAREHOUSE':
    case 'IN_TRANSIT':
      return 'AWAITING_SHIPMENT'
    case 'READY_FOR_DELIVERY':
    case 'ARRIVED_AT_RECEIVER_CITY_WAREHOUSE':
      return 'SHIPPED'
    case 'DELIVERED':
    case 'POSTOMAT_RECEIVED':
      return 'DELIVERED'
    case 'NOT_DELIVERED':
    case 'STORAGE_EXPIRED':
      return 'ON_HOLD'
    case 'RETURNED_TO_SENDER':
    case 'RETURNED_TO_SENDER_CITY_WAREHOUSE':
      return 'RETURNED'
    case 'CANCELLED':
    case 'CANCEL_PICKUP':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: CdekOrder): Order {
  const statuses = raw.statuses ?? []
  const latestStatus = statuses.length > 0 ? statuses[statuses.length - 1] : undefined

  // CDEK orders correspond 1:1 with shipments (uuid is shared).
  const uuid = raw.uuid ?? raw.cdek_number ?? undefined

  const fromLocation = raw.from_location as CdekLocation | null | undefined
  const toLocation = raw.to_location as CdekLocation | null | undefined
  const sender = raw.sender as CdekContact | null | undefined
  const recipient = raw.recipient as CdekContact | null | undefined

  return {
    id: uuid,
    status: mapOrderStatus(latestStatus?.code),
    orderNumber: raw.number ?? raw.cdek_number ?? undefined,
    originAddress: transformAddress(fromLocation, sender),
    destinationAddress: transformAddress(toLocation, recipient),
    shipmentIds: uuid ? [uuid] : undefined,
    requestedServiceCode: raw.tariff_code != null ? String(raw.tariff_code) : undefined,
    createdAt: toISODate(raw.date_created),
    updatedAt: toISODate(raw.date_updated),
    metadata: raw as Record<string, unknown>,
  }
}
