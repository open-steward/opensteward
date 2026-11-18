import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface EnviaYaRateResult {
  carrier?: string | null
  carrier_name?: string | null
  carrier_service_code?: string | null
  carrier_service_name?: string | null
  total_amount?: number | string | null
  net_total_amount?: number | string | null
  currency?: string | null
  estimated_delivery?: string | null
  estimated_delivery_days?: number | string | null
  transit_days?: number | string | null
  guaranteed?: boolean | null
  rate_id?: string | null
  [key: string]: unknown
}

export function transformRate(raw: EnviaYaRateResult): Rate {
  const transitDaysRaw = raw.transit_days ?? raw.estimated_delivery_days ?? null
  const transitDays =
    transitDaysRaw != null ? Math.round(parseDecimal(transitDaysRaw) ?? 0) : undefined

  return {
    id: raw.rate_id ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.carrier_service_code ?? undefined,
    serviceName: raw.carrier_service_name ?? raw.carrier_name ?? undefined,
    currency: (raw.currency as string | undefined) ?? 'MXN',
    totalAmount: parseDecimal(raw.total_amount),
    retailAmount: parseDecimal(raw.net_total_amount),
    transitDays,
    deliveryDays: transitDays,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
