import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * Quiqup rate/quote — returned by the rates endpoint when querying
 * available delivery options for an origin → destination pair.
 */
export interface QuiqupRate {
  id?: string | null
  service_type?: string | null
  service_name?: string | null
  currency?: string | null
  total_amount?: number | null
  transit_days?: number | null
  estimated_delivery_at?: string | null
  is_guaranteed?: boolean | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: QuiqupRate): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: 'quiqup',
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.total_amount != null ? Math.round(raw.total_amount * 100) : undefined,
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    isGuaranteedDelivery: raw.is_guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
