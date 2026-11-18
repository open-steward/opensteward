import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface CargoOneRate {
  id?: string | null
  carrier_id?: string | null
  carrier_name?: string | null
  service_code?: string | null
  service_name?: string | null
  currency?: string | null
  total_amount?: number | string | null
  retail_amount?: number | string | null
  transit_days?: number | null
  estimated_delivery_at?: string | null
  is_guaranteed?: boolean | null
  delivery_days?: number | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: CargoOneRate): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier_id ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_amount),
    retailAmount: parseDecimal(raw.retail_amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.delivery_days ?? raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    isGuaranteedDelivery: raw.is_guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
