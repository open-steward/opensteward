import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface XpoRateQuote {
  serviceType: string
  serviceName?: string
  totalCharge?: number
  currency?: string
  transitDays?: number
  estimatedDeliveryDate?: string
  guaranteedService?: boolean
  [key: string]: unknown
}

export interface XpoRateResponse {
  rateQuotes: XpoRateQuote[]
  [key: string]: unknown
}

export function transformRate(raw: XpoRateQuote): Rate {
  return {
    id: undefined,
    carrierId: 'xpo',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.totalCharge),
    transitDays: raw.transitDays,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.guaranteedService,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
