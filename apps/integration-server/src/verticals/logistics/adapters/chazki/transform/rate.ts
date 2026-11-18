import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Chazki rate/tariff object — returned by POST /rates or GET /tariffs.
 */
export interface ChazkiRate {
  id?: string | null
  carrier?: string | null
  service?: string | null
  service_name?: string | null
  service_type?: string | null
  currency?: string | null
  amount?: number | null
  price?: number | null
  total?: number | null
  retail_price?: number | null
  transit_days?: number | null
  delivery_days?: number | null
  estimated_delivery_date?: string | null
  guaranteed?: boolean | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: ChazkiRate): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier ?? 'chazki',
    serviceCode: raw.service ?? raw.service_type ?? undefined,
    serviceName: raw.service_name ?? raw.service ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.amount ?? raw.price ?? raw.total),
    retailAmount: parseDecimal(raw.retail_price),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.delivery_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
