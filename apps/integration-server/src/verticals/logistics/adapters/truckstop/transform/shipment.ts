import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate, parseDecimal } from '../../shared/transform'
import { LOAD_STATUS_SHIPMENT_MAP } from '../constants'

// ── Raw Truckstop load shapes ──────────────────────────────────────────────

export interface TruckstopLoadStop {
  stopType?: string
  locationName?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  earlyDate?: string
  lateDate?: string
  [key: string]: unknown
}

export interface TruckstopRateAttributes {
  rateType?: string
  amount?: number
  currency?: string
  [key: string]: unknown
}

export interface TruckstopEquipmentAttributes {
  equipmentType?: string
  length?: number
  weight?: number
  [key: string]: unknown
}

export interface TruckstopLoad {
  loadId?: string
  loadGuid?: string
  loadNumber?: string
  status?: string
  loadStops?: TruckstopLoadStop[]
  equipmentAttributes?: TruckstopEquipmentAttributes
  rateAttributes?: TruckstopRateAttributes
  commodityId?: number
  note?: string
  isPrivate?: boolean
  postedDate?: string
  lastUpdatedDate?: string
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  return (LOAD_STATUS_SHIPMENT_MAP[status] as ShipmentStatus) ?? 'UNKNOWN'
}

function pickupStop(stops: TruckstopLoadStop[] | undefined): TruckstopLoadStop | undefined {
  if (!stops || stops.length === 0) return undefined
  // First stop is always the pickup/origin
  return stops.find((s) => s.stopType?.toLowerCase() === 'pickup') ?? stops[0]
}

function deliveryStop(stops: TruckstopLoadStop[] | undefined): TruckstopLoadStop | undefined {
  if (!stops || stops.length === 0) return undefined
  // Last stop is always delivery/destination
  return stops.find((s) => s.stopType?.toLowerCase() === 'delivery') ?? stops[stops.length - 1]
}

function toAddress(stop: TruckstopLoadStop | undefined): Address | undefined {
  if (!stop) return undefined
  const hasAny = stop.city || stop.state || stop.zip || stop.country || stop.address1
  if (!hasAny) return undefined
  return {
    name: stop.locationName ?? undefined,
    street1: stop.address1 ?? undefined,
    street2: stop.address2 ?? undefined,
    city: stop.city ?? undefined,
    state: stop.state ?? undefined,
    postalCode: stop.zip ?? undefined,
    country: (stop.country as string | undefined) ?? undefined,
  }
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformLoad(raw: TruckstopLoad): Shipment {
  const stops = raw.loadStops ?? []
  const origin = toAddress(pickupStop(stops))
  const destination = toAddress(deliveryStop(stops))
  const weightValue = parseDecimal(raw.equipmentAttributes?.weight)

  return {
    id: raw.loadGuid ?? raw.loadId ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.loadNumber ?? undefined,
    carrierId: 'truckstop',
    serviceCode: raw.equipmentAttributes?.equipmentType ?? undefined,
    originAddress: origin,
    destinationAddress: destination,
    totalWeight: weightValue != null ? { value: weightValue, unit: 'lb' } : undefined,
    notes: raw.note ?? undefined,
    cost:
      raw.rateAttributes?.amount != null
        ? {
            amount: Math.round((parseDecimal(raw.rateAttributes.amount) ?? 0) * 100),
            currency: (raw.rateAttributes.currency ?? 'USD') as 'USD',
          }
        : undefined,
    createdAt: toISODate(raw.postedDate) ?? undefined,
    updatedAt: toISODate(raw.lastUpdatedDate) ?? undefined,
    mode: 'ftl',
    metadata: raw as Record<string, unknown>,
  }
}
