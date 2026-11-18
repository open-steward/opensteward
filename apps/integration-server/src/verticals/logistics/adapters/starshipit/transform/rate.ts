import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

export interface StarshipitRate {
  service_name?: string | null
  service_code?: string | null
  carrier_name?: string | null
  carrier_code?: string | null
  price?: number | string | null
  currency?: string | null
  estimated_transit_days?: number | null
  transit_days?: number | null
  guaranteed?: boolean | null
  [key: string]: unknown
}

export function transformRate(raw: StarshipitRate): Rate {
  return {
    carrierId: raw.carrier_code ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? raw.service_name ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'AUD',
    totalAmount: parseDecimal(raw.price),
    transitDays: raw.transit_days ?? raw.estimated_transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? raw.estimated_transit_days ?? undefined,
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
