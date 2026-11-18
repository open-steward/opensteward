import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ── Raw API types ────────────────────────────────────────────────────────────

export interface CHRRateResponse {
  quoteId?: string
  rateId?: string
  serviceCode?: string
  serviceName?: string
  serviceType?: string
  totalCharges?: number
  lineHaulCharges?: number
  fuelCharges?: number
  currency?: string
  transitDays?: number
  estimatedPickupDate?: string
  estimatedDeliveryDate?: string
  isGuaranteed?: boolean
  [key: string]: unknown
}

export interface CHRRatesListResponse {
  quotes?: CHRRateResponse[]
  rates?: CHRRateResponse[]
  [key: string]: unknown
}

// ── Public transform ─────────────────────────────────────────────────────────

export function transformRate(raw: CHRRateResponse): Rate {
  const totalAmount = parseDecimal(raw.totalCharges)
  const lineHaul = parseDecimal(raw.lineHaulCharges)

  return {
    id: raw.quoteId ?? raw.rateId ?? undefined,
    carrierId: 'ch-robinson',
    serviceCode: raw.serviceCode ?? raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: (raw.currency ?? 'USD') as Rate['currency'],
    totalAmount: totalAmount ?? undefined,
    retailAmount: lineHaul ?? undefined,
    transitDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.isGuaranteed ?? undefined,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
