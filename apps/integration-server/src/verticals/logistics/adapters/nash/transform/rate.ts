import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface NashQuote {
  id?: string
  provider_name?: string | null
  total_price?: number | null
  currency?: string | null
  dropoff_eta?: string | null
  [key: string]: unknown
}

export function transformRate(raw: NashQuote): Rate {
  return {
    id: raw.id,
    carrierId: 'nash',
    serviceCode: raw.provider_name ?? 'nash',
    serviceName: raw.provider_name ?? 'Nash',
    currency: raw.currency ?? 'USD',
    totalAmount: raw.total_price != null ? raw.total_price / 100 : undefined,
    estimatedDeliveryAt: toISODate(raw.dropoff_eta),
    metadata: raw as Record<string, unknown>,
  }
}
