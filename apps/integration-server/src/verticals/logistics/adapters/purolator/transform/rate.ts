import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Purolator raw types ────────────────────────────────────────────────────

export interface PurolatorSurcharge {
  Amount?: number | null
  Type?: string | null
  Description?: string | null
  [key: string]: unknown
}

export interface PurolatorTax {
  Amount?: number | null
  Type?: string | null
  Description?: string | null
  [key: string]: unknown
}

export interface PurolatorShipmentEstimate {
  ServiceID?: string | null
  ShipmentDate?: string | null
  ExpectedDeliveryDate?: string | null
  EstimatedTransitDays?: number | null
  BasePrice?: number | null
  Surcharges?: { Surcharge?: PurolatorSurcharge[] } | null
  Taxes?: { Tax?: PurolatorTax[] } | null
  TotalPrice?: number | null
  [key: string]: unknown
}

export interface PurolatorGetFullEstimateResponse {
  ShipmentEstimates?: { ShipmentEstimate?: PurolatorShipmentEstimate[] } | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: PurolatorShipmentEstimate): Rate {
  const totalAmount = parseDecimal(raw.TotalPrice)
  const baseAmount = parseDecimal(raw.BasePrice)

  return {
    carrierId: 'purolator',
    serviceCode: raw.ServiceID ?? undefined,
    serviceName: raw.ServiceID ?? undefined,
    currency: 'CAD',
    totalAmount: totalAmount != null ? Math.round(totalAmount * 100) : undefined,
    retailAmount: baseAmount != null ? Math.round(baseAmount * 100) : undefined,
    transitDays: raw.EstimatedTransitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.ExpectedDeliveryDate),
    isGuaranteedDelivery: false,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRates(raw: PurolatorGetFullEstimateResponse): Rate[] {
  const estimates = raw.ShipmentEstimates?.ShipmentEstimate ?? []
  return estimates.map(transformRate)
}
