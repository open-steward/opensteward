import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Raw Outvio rate object as returned by POST /v1/rates or embedded within
 * shipment creation responses.
 */
export interface OutvioRate {
  id?: string | null
  carrierId?: string | null
  carrier_id?: string | null
  carrier?: string | null
  serviceCode?: string | null
  service_code?: string | null
  serviceName?: string | null
  service_name?: string | null
  currency?: string | null
  amount?: number | null
  total?: number | null
  retailAmount?: number | null
  retail_amount?: number | null
  transitDays?: number | null
  transit_days?: number | null
  deliveryDays?: number | null
  delivery_days?: number | null
  estimatedDeliveryDate?: string | null
  estimated_delivery_date?: string | null
  isGuaranteed?: boolean | null
  is_guaranteed?: boolean | null
  createdAt?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: OutvioRate): Rate {
  const carrierId = raw.carrierId ?? raw.carrier_id ?? raw.carrier ?? undefined
  const serviceCode = raw.serviceCode ?? raw.service_code ?? undefined
  const serviceName = raw.serviceName ?? raw.service_name ?? undefined
  const totalAmount = parseDecimal(raw.amount ?? raw.total)
  const retailAmount = parseDecimal(raw.retailAmount ?? raw.retail_amount)
  const transitDays = raw.transitDays ?? raw.transit_days ?? undefined
  const deliveryDays = raw.deliveryDays ?? raw.delivery_days ?? undefined
  const estimatedDeliveryAt = toISODate(raw.estimatedDeliveryDate ?? raw.estimated_delivery_date)
  const isGuaranteed = raw.isGuaranteed ?? raw.is_guaranteed ?? undefined

  return {
    id: raw.id ?? undefined,
    carrierId,
    serviceCode,
    serviceName,
    currency: raw.currency ?? undefined,
    totalAmount,
    retailAmount,
    transitDays: transitDays != null ? Math.round(transitDays) : undefined,
    deliveryDays: deliveryDays != null ? Math.round(deliveryDays) : undefined,
    estimatedDeliveryAt,
    isGuaranteedDelivery: isGuaranteed ?? undefined,
    createdAt: toISODate(raw.createdAt ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
