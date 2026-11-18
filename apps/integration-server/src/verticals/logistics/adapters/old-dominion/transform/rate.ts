import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface OldDominionRateQuote {
  serviceType: string
  serviceName?: string
  totalCharge?: number
  currency?: string
  transitDays?: number
  estimatedDeliveryDate?: string
  guaranteedService?: boolean
  [key: string]: unknown
}

export interface OldDominionRateResponse {
  rateQuotes: OldDominionRateQuote[]
  [key: string]: unknown
}

export function transformRate(raw: OldDominionRateQuote): Rate {
  return {
    id: undefined,
    carrierId: 'old-dominion',
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
