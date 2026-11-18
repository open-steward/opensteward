import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toAddress } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

export interface E2openShipmentRaw {
  shipmentId?: string
  referenceNumber?: string
  trackingNumber?: string
  status?: string
  mode?: string
  serviceType?: string
  carrier?: string
  createdDate?: string
  updatedDate?: string
  estimatedDeliveryDate?: string
  actualDeliveryDate?: string
  origin?: Record<string, unknown>
  destination?: Record<string, unknown>
  totalWeight?: { value?: number; unit?: string }
  cost?: { amount?: number; currency?: string }
  notes?: string
  [key: string]: unknown
}

function toShipmentStatus(code: string | undefined): ShipmentStatus {
  if (!code) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[code.toUpperCase()] as ShipmentStatus | undefined) ?? 'UNKNOWN'
}

export function transformShipment(raw: E2openShipmentRaw): Shipment {
  return {
    id: raw.shipmentId,
    status: toShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? raw.referenceNumber ?? undefined,
    carrierId: raw.carrier ?? 'e2open',
    serviceCode: raw.serviceType ?? undefined,
    originAddress: toAddress(raw.origin ?? null),
    destinationAddress: toAddress(raw.destination ?? null),
    totalWeight:
      raw.totalWeight?.value != null
        ? {
            value: raw.totalWeight.value,
            unit: raw.totalWeight.unit === 'KG' ? 'kg' : 'lb',
          }
        : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.actualDeliveryDate),
    cost:
      raw.cost?.amount != null
        ? { amount: raw.cost.amount, currency: raw.cost.currency ?? 'USD' }
        : undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
