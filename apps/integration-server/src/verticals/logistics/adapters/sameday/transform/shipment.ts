import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, parseDecimal } from '../../shared/transform'

/**
 * Raw AWB object returned by POST /api/awb.
 */
export interface SamedayAwbResponse {
  awbNumber: string
  awbCost: number
  parcels: Array<{ position: number; awbNumber: string }>
  [key: string]: unknown
}

/**
 * Expedition status object returned inside the AWB status history response.
 * GET /api/client/awb/{awb}/status → expeditionStatus
 */
export interface SamedayExpeditionStatus {
  statusId: number
  status: number
  statusLabel: string
  statusState: string
  statusDate: string
  county: string | null
  reason: string | null
  transitLocation: string | null
  [key: string]: unknown
}

/**
 * Full status history response for GET /api/client/awb/{awb}/status.
 */
export interface SamedayAwbStatusHistory {
  expeditionSummary: {
    delivered: boolean
    canceled: boolean
    deliveryAttempts: number
    awbNumber: string
    awbWeight: number
    servicePayment: number
    cashOnDelivery: number
    redirectionsAttempts: number
    deliveredAt: string | null
    lastDeliveryAttempt: string | null
    [key: string]: unknown
  }
  expeditionHistory: SamedayExpeditionStatus[]
  parcelsStatus: Array<SamedayExpeditionStatus & { parcelAwbNumber: string }>
  expeditionStatus: SamedayExpeditionStatus
  [key: string]: unknown
}

/**
 * Map Sameday status codes to canonical ShipmentStatus.
 *
 * Sameday status IDs (from statusId field):
 *   1  = In transit
 *   2  = Delivered
 *   3  = Out for delivery
 *   4  = Failed delivery attempt
 *   5  = Returned
 *   6  = Exception
 *   10 = Pickup
 *   20 = On route
 *   30 = Delivered to locker
 *
 * statusState values: "in_transit", "delivered", "canceled", etc.
 */
function mapShipmentStatus(statusId: number, statusState: string): ShipmentStatus {
  // Prefer statusId for precision; fall back to statusState string.
  switch (statusId) {
    case 1:  return 'IN_TRANSIT'
    case 2:  return 'DELIVERED'
    case 3:  return 'OUT_FOR_DELIVERY'
    case 4:  return 'EXCEPTION'
    case 5:  return 'RETURNED'
    case 6:  return 'EXCEPTION'
    case 10: return 'PENDING'
    case 20: return 'IN_TRANSIT'
    case 30: return 'DELIVERED'
  }

  switch (statusState) {
    case 'delivered':         return 'DELIVERED'
    case 'canceled':          return 'CANCELLED'
    case 'in_transit':        return 'IN_TRANSIT'
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'returned':          return 'RETURNED'
    default:                  return 'UNKNOWN'
  }
}

/**
 * Transform a raw POST /api/awb response into a canonical Shipment.
 * This response only contains the AWB number and cost; richer status info
 * comes from the status history endpoint.
 */
export function transformAwbResponse(raw: SamedayAwbResponse): Shipment {
  return {
    id: raw.awbNumber ?? undefined,
    trackingNumber: raw.awbNumber ?? undefined,
    status: 'LABEL_CREATED',
    carrierId: 'sameday',
    cost:
      raw.awbCost !== undefined && raw.awbCost !== null
        ? { amount: parseDecimal(raw.awbCost) ?? 0, currency: 'RON' }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a raw GET /api/client/awb/{awb}/status response into a canonical
 * Shipment. The AWB number is passed in separately (it is not in the response).
 */
export function transformAwbStatusToShipment(
  raw: SamedayAwbStatusHistory,
  awbNumber: string,
): Shipment {
  const summary = raw.expeditionSummary ?? {}
  const currentStatus = raw.expeditionStatus ?? {}

  const statusId = (currentStatus.statusId as number | undefined) ?? 0
  const statusState = (currentStatus.statusState as string | undefined) ?? ''

  return {
    id: awbNumber,
    trackingNumber: awbNumber,
    status: mapShipmentStatus(statusId, statusState),
    carrierId: 'sameday',
    totalWeight:
      summary.awbWeight !== undefined && summary.awbWeight !== null
        ? { value: parseDecimal(summary.awbWeight) ?? 0, unit: 'kg' }
        : undefined,
    estimatedDeliveryAt: undefined, // not provided in status history
    actualDeliveryAt: summary.deliveredAt ? toISODate(summary.deliveredAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
