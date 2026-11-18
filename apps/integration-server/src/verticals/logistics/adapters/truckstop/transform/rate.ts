import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ── Raw Truckstop rate/modeled-rate shapes ────────────────────────────────

export interface TruckstopRateEstimate {
  /** Unique identifier for this rate estimate, if provided. */
  rateEstimateId?: string
  serviceType?: string
  serviceName?: string
  /** Rate amount in dollars (Truckstop uses decimal dollars). */
  ratePerMile?: number
  totalRate?: number
  currency?: string
  estimatedTransitDays?: number
  estimatedPickupDate?: string
  estimatedDeliveryDate?: string
  [key: string]: unknown
}

export interface TruckstopRateEstimateResponse {
  rateEstimate?: TruckstopRateEstimate
  rateEstimates?: TruckstopRateEstimate[]
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformRateEstimate(raw: TruckstopRateEstimate): Rate {
  const totalAmount = parseDecimal(raw.totalRate)

  return {
    id: raw.rateEstimateId ?? undefined,
    carrierId: 'truckstop',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: (raw.currency ?? 'USD') as 'USD',
    // Truckstop rates are in dollars — convert to minor units (cents)
    totalAmount: totalAmount != null ? Math.round(totalAmount * 100) : undefined,
    transitDays: raw.estimatedTransitDays != null ? Math.round(raw.estimatedTransitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate) ?? undefined,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRateResponse(raw: TruckstopRateEstimateResponse): Rate[] {
  const estimates: TruckstopRateEstimate[] = raw.rateEstimates ?? (raw.rateEstimate ? [raw.rateEstimate] : [])
  return estimates.map(transformRateEstimate)
}
