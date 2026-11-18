import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address, Money } from '../../../schema/shared'
import { toISODate, parseDecimal } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

// ── Raw API types ────────────────────────────────────────────────────────────

export interface CHRAddress {
  name?: string
  companyName?: string
  address1?: string
  address2?: string
  city?: string
  stateProvince?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface CHRWeight {
  value?: number
  unit?: string
  [key: string]: unknown
}

export interface CHRMoney {
  amount?: number
  currency?: string
  [key: string]: unknown
}

export interface CHRShipmentResponse {
  loadId?: string
  shipmentId?: string
  referenceNumber?: string
  proNumber?: string
  bolNumber?: string
  status?: string
  serviceMode?: string
  serviceType?: string
  pickupDate?: string
  deliveryDate?: string
  estimatedDeliveryDate?: string
  origin?: CHRAddress
  destination?: CHRAddress
  totalWeight?: CHRWeight
  totalCost?: CHRMoney
  labelUrl?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(raw: string | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[raw] as ShipmentStatus) ?? 'UNKNOWN'
}

function mapMode(raw: string | undefined): Shipment['mode'] {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower.includes('ftl') || lower.includes('full')) return 'ftl'
  if (lower.includes('ltl') || lower.includes('less')) return 'ltl'
  if (lower.includes('air')) return 'air'
  if (lower.includes('ocean') || lower.includes('sea')) return 'ocean'
  if (lower.includes('rail')) return 'rail'
  if (lower.includes('parcel')) return 'parcel'
  return undefined
}

function toAddr(raw: CHRAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.companyName ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.stateProvince ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: (raw.country as Address['country']) ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

function toCost(raw: CHRMoney | undefined): Money | undefined {
  if (!raw || raw.amount === undefined) return undefined
  return {
    amount: raw.amount,
    currency: (raw.currency ?? 'USD') as Money['currency'],
  }
}

// ── Public transform ─────────────────────────────────────────────────────────

export function transformShipment(raw: CHRShipmentResponse): Shipment {
  const weightValue = parseDecimal(raw.totalWeight?.value)

  return {
    id: raw.loadId ?? raw.shipmentId ?? undefined,
    status: mapStatus(raw.status),
    trackingNumber: raw.proNumber ?? raw.referenceNumber ?? undefined,
    carrierId: 'ch-robinson',
    serviceCode: raw.serviceType ?? undefined,
    mode: mapMode(raw.serviceMode ?? raw.serviceType),
    originAddress: toAddr(raw.origin),
    destinationAddress: toAddr(raw.destination),
    totalWeight:
      weightValue !== undefined
        ? {
            value: weightValue,
            unit: raw.totalWeight?.unit?.toLowerCase() === 'kg' ? 'kg' : 'lb',
          }
        : undefined,
    cost: toCost(raw.totalCost),
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.bolNumber ?? raw.referenceNumber ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.deliveryDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
