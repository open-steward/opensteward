import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface MetapackRate {
  id?: string
  carrier?: string
  service_code?: string
  service_name?: string
  currency?: string
  total_amount?: number | string
  retail_amount?: number | string | null
  transit_days?: number | null
  estimated_delivery_at?: string | null
  guaranteed?: boolean
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: MetapackRate): Rate {
  return {
    id: raw.id,
    carrierId: raw.carrier ?? 'metapack',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_amount),
    retailAmount: parseDecimal(raw.retail_amount ?? undefined),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
