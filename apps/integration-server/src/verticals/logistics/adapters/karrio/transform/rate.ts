import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface KarrioRateResult {
  id?: string | null
  carrier_id?: string | null
  carrier_name?: string | null
  service?: string | null
  total_charge?: number | null
  currency?: string | null
  transit_days?: number | null
  estimated_delivery?: string | null
  extra_charges?: { name?: string; amount?: number; currency?: string }[]
  test_mode?: boolean | null
  [key: string]: unknown
}

export function transformRate(raw: KarrioRateResult): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier_id ?? undefined,
    serviceCode: raw.service ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_charge),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    metadata: raw as Record<string, unknown>,
  }
}
