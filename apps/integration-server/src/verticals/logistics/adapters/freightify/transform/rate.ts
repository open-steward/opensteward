import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A single freight rate returned by the Freightify rates API.
 * Freightify provides both spot rates and contract rates for FCL/LCL ocean freight.
 */
export interface FreightifyRate {
  id?: string | null
  carrier_name?: string | null
  carrier_scac?: string | null
  service_code?: string | null
  service_name?: string | null
  currency?: string | null
  total_amount?: number | string | null     // total freight charge
  base_amount?: number | string | null      // base freight (pre-surcharges)
  transit_days?: number | null
  estimated_delivery?: string | null
  is_guaranteed?: boolean | null
  valid_from?: string | null
  valid_until?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: FreightifyRate): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier_scac ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_amount),
    retailAmount: parseDecimal(raw.base_amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    isGuaranteedDelivery: raw.is_guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
