import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// CargoWise shipment record as returned by GET /shipments and GET /shipments/:id

export interface CargowiseShipmentAddress {
  street?: string
  city?: string
  state?: string
  postCode?: string
  country?: string
  [key: string]: unknown
}

export interface CargowiseShipmentResponse {
  shipmentId: string
  houseBillNumber?: string
  masterBillNumber?: string
  status?: string
  serviceCode?: string
  transportMode?: string
  warehouseId?: string
  originAddress?: CargowiseShipmentAddress
  destinationAddress?: CargowiseShipmentAddress
  estimatedDeliveryDate?: string
  actualDeliveryDate?: string
  labelUrl?: string
  reference?: string
  notes?: string
  createdDate?: string
  lastUpdatedDate?: string
  [key: string]: unknown
}

export interface CargowiseShipmentsListResponse {
  shipments: CargowiseShipmentResponse[]
  [key: string]: unknown
}

const STATUS_MAP: Record<string, ShipmentStatus> = {
  BOOKED: 'LABEL_CREATED',
  PICKUP: 'LABEL_CREATED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}

function mapStatus(raw: string | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  return STATUS_MAP[raw.toUpperCase()] ?? 'UNKNOWN'
}

function toShipmentAddress(raw: CargowiseShipmentAddress | undefined) {
  if (!raw) return undefined
  const hasAny = raw.street || raw.city || raw.state || raw.postCode || raw.country
  if (!hasAny) return undefined
  return {
    street1: raw.street ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postCode ?? undefined,
    country: raw.country ?? undefined,
  }
}

export function transformShipment(raw: CargowiseShipmentResponse): Shipment {
  return {
    id: raw.shipmentId,
    status: mapStatus(raw.status),
    trackingNumber: raw.houseBillNumber ?? raw.masterBillNumber ?? undefined,
    carrierId: 'cargowise',
    serviceCode: raw.serviceCode ?? raw.transportMode ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    originAddress: toShipmentAddress(raw.originAddress),
    destinationAddress: toShipmentAddress(raw.destinationAddress),
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.actualDeliveryDate),
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.lastUpdatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
