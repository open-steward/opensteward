import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Estes raw types ────────────────────────────────────────────────────────

export interface EstesRateQuote {
  quoteNumber: string
  serviceLevel: string
  serviceLevelDescription: string
  totalCharges: number
  currency: string
  transitDays: number | null
  deliveryDate: string | null
  guaranteed: boolean | null
  discountAmount: number | null
  [key: string]: unknown
}

export interface EstesRateResponse {
  data: {
    quotes: EstesRateQuote[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: EstesRateQuote): Rate {
  return {
    id: raw.quoteNumber ?? undefined,
    carrierId: 'estes',
    serviceCode: raw.serviceLevel ?? undefined,
    serviceName: raw.serviceLevelDescription ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.totalCharges),
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.deliveryDate),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
