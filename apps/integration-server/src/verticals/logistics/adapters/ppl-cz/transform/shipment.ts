import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate, parseDecimal } from '../../shared/transform'

// ── PPL CZ raw types ──────────────────────────────────────────────────────

export interface PplCzAddress {
  name?: string | null
  name2?: string | null
  street?: string | null
  city?: string | null
  zipCode?: string | null
  country?: string | null
  contact?: string | null
  phone?: string | null
  email?: string | null
}

export interface PplCzShipment {
  /** PPL internal shipment number (e.g. "41000012345") */
  shipmentNumber?: string | null
  /** Customer-assigned reference */
  referenceId?: string | null
  productType?: string | null
  /** Shipment state code (integer as returned by the API) */
  stateCode?: number | null
  /** Human-readable state description */
  stateName?: string | null
  /** Last event timestamp */
  lastStateChangeDate?: string | null
  /** Estimated delivery date */
  estimatedDeliveryDate?: string | null
  /** Actual delivery timestamp */
  deliveryDate?: string | null
  recipient?: PplCzAddress | null
  sender?: PplCzAddress | null
  weight?: number | null            // kg
  note?: string | null
  labelUrl?: string | null
  /** Declared value (CZK) for insurance / CoD */
  insuranceValue?: number | null
  currency?: string | null
  depot?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────

/**
 * Map PPL CZ numeric state codes to canonical ShipmentStatus.
 *
 * PPL CZ state codes are documented at /codelist/status. Key mappings:
 *   0–9   pre-shipment / label-printed states
 *   10–19 in-transit states
 *   20    delivered
 *   30    available for pickup
 *   50    returned
 *   90+   exceptions / failures
 */
function mapShipmentStatus(stateCode: number | null | undefined): ShipmentStatus {
  if (stateCode === null || stateCode === undefined) return 'UNKNOWN'
  if (stateCode === 0) return 'PENDING'
  if (stateCode >= 1 && stateCode <= 9) return 'LABEL_CREATED'
  if (stateCode >= 10 && stateCode <= 19) return 'IN_TRANSIT'
  if (stateCode === 20) return 'DELIVERED'
  if (stateCode === 21) return 'OUT_FOR_DELIVERY'
  if (stateCode === 30) return 'OUT_FOR_DELIVERY'  // available for pickup
  if (stateCode >= 50 && stateCode <= 59) return 'RETURNED'
  if (stateCode >= 60 && stateCode <= 69) return 'CANCELLED'
  if (stateCode >= 90) return 'EXCEPTION'
  return 'UNKNOWN'
}

// ── Address transform ─────────────────────────────────────────────────────

function transformPplAddress(raw: PplCzAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.name2 ?? undefined,
    street1: raw.street ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.zipCode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ── Shipment transform ────────────────────────────────────────────────────

export function transformShipment(raw: PplCzShipment): Shipment {
  const weightKg = parseDecimal(raw.weight)

  return {
    id: raw.shipmentNumber ?? undefined,
    status: mapShipmentStatus(raw.stateCode),
    trackingNumber: raw.shipmentNumber ?? undefined,
    carrierId: 'ppl-cz',
    serviceCode: raw.productType ?? undefined,
    originAddress: transformPplAddress(raw.sender),
    destinationAddress: transformPplAddress(raw.recipient),
    totalWeight:
      weightKg !== undefined ? { value: weightKg, unit: 'kg' } : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    cost:
      raw.insuranceValue !== null &&
      raw.insuranceValue !== undefined &&
      raw.currency
        ? {
            amount: parseDecimal(raw.insuranceValue) ?? 0,
            currency: raw.currency,
          }
        : undefined,
    reference: raw.referenceId ?? undefined,
    notes: raw.note ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.deliveryDate),
    createdAt: toISODate(raw.lastStateChangeDate),
    updatedAt: toISODate(raw.lastStateChangeDate),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Batch result wrapper ──────────────────────────────────────────────────

export interface PplCzBatchResult {
  importState?: string | null
  shipments?: PplCzShipment[]
  [key: string]: unknown
}
