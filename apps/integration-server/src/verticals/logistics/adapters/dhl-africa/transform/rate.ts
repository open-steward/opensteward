import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface DhlAfricaRateResponse {
  rateId: string
  serviceType: string
  serviceName: string
  totalPrice?: number
  currency?: string
  estimatedDeliveryDate?: string
  transitDays?: number
  [key: string]: unknown
}

export interface DhlAfricaRatesResponse {
  rates: DhlAfricaRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: DhlAfricaRateResponse): Rate {
  return {
    id: raw.rateId ?? undefined,
    carrierId: 'dhl-africa',
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
