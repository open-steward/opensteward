import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface MercuryGateRateResponse {
  quoteId: string
  serviceType: string
  serviceName: string
  totalPrice?: number
  currency?: string
  estimatedPickupDate?: string
  estimatedDeliveryDate?: string
  transitDays?: number
  [key: string]: unknown
}

export interface MercuryGateRatesResponse {
  quotes: MercuryGateRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: MercuryGateRateResponse): Rate {
  return {
    id: raw.quoteId ?? undefined,
    carrierId: 'mercurygate',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.totalPrice),
    transitDays: raw.transitDays,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
