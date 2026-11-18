import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface RoyalMailRateResponse {
  serviceCode: string
  serviceName: string
  totalPrice?: number
  currency?: string
  estimatedDeliveryDate?: string
  [key: string]: unknown
}

export interface RoyalMailRatesResponse {
  rates: RoyalMailRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: RoyalMailRateResponse): Rate {
  return {
    id: undefined,
    carrierId: 'royalmail',
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: raw.currency ?? 'GBP',
    totalAmount: parseDecimal(raw.totalPrice),
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
