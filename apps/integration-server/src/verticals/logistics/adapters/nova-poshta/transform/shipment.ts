import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type NovaPoshtaAddress } from './address'
import { NOVA_POSHTA_CARRIER_ID } from '../constants'

/**
 * Nova Poshta shipment object returned by GET /shipments and POST /shipments.
 *
 * Field names follow the v1.0 API documented at api-portal.novapost.com.
 * Optional/unknown fields use `unknown` to remain forward-compatible.
 */
export interface NovaPoshtaShipment {
  id?: string | null
  number?: string | null                // TTN (tracking number)
  status?: string | null                // e.g. "Created", "InTransit", "Delivered"
  statusCode?: number | string | null
  serviceCode?: string | null           // delivery service type
  recipient?: NovaPoshtaAddress | null
  sender?: NovaPoshtaAddress | null
  weight?: number | null                // kg
  volumetricWeight?: number | null      // kg
  length?: number | null                // cm
  width?: number | null                 // cm
  height?: number | null                // cm
  declaredCost?: number | null          // declared value in minor units
  currency?: string | null
  labelUrl?: string | null
  estimatedDeliveryDate?: string | null
  actualDeliveryDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  warehouseId?: string | null
  description?: string | null
  payerType?: string | null             // "Sender" | "Recipient"
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toLowerCase()) {
    case 'created':
    case 'labelcreated':
    case 'label_created':
      return 'LABEL_CREATED'
    case 'intransit':
    case 'in_transit':
    case 'transit':
    case 'processing':
    case 'accepted':
      return 'IN_TRANSIT'
    case 'outfordelivery':
    case 'out_for_delivery':
    case 'delivering':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'received':
      return 'DELIVERED'
    case 'returned':
    case 'return':
    case 'returnedtosender':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
    case 'deleted':
      return 'CANCELLED'
    case 'exception':
    case 'lost':
    case 'damaged':
    case 'error':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: NovaPoshtaShipment): Shipment {
  const weightKg = raw.weight ?? raw.volumetricWeight
  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.number ?? undefined,
    carrierId: NOVA_POSHTA_CARRIER_ID,
    serviceCode: raw.serviceCode ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    originAddress: raw.sender ? transformAddress(raw.sender) : undefined,
    destinationAddress: raw.recipient ? transformAddress(raw.recipient) : undefined,
    totalWeight: toWeight(weightKg, 'kg'),
    labelUrl: raw.labelUrl ?? undefined,
    cost:
      raw.declaredCost !== undefined && raw.declaredCost !== null
        ? {
            amount: parseDecimal(raw.declaredCost) ?? 0,
            currency: raw.currency ?? 'UAH',
          }
        : undefined,
    reference: raw.number ?? undefined,
    notes: raw.description ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.actualDeliveryDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
