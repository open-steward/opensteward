import type { Rate } from '../../../schema/rate'

/**
 * Raw response from POST /api/awb/estimate-cost.
 * { amount: float, currency: string, time: int }
 */
export interface SamedayEstimationResponse {
  amount: number
  currency: string
  time: number // estimated transit time in days
  [key: string]: unknown
}

/**
 * Transform a Sameday AWB cost estimation response into a canonical Rate.
 * serviceId is passed through as the serviceCode.
 */
export function transformEstimation(raw: SamedayEstimationResponse, serviceId?: number): Rate {
  return {
    carrierId: 'sameday',
    serviceCode: serviceId !== undefined ? String(serviceId) : undefined,
    currency: (raw.currency as string | undefined) ?? 'RON',
    totalAmount: raw.amount != null ? Math.round(raw.amount * 100) : undefined,
    transitDays: (raw.time as number | undefined) ?? undefined,
    deliveryDays: (raw.time as number | undefined) ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
