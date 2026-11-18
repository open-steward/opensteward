import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface VamashipRateResult {
  courier_id: number | null
  courier_name: string | null
  service_type: string | null
  total_charges: number | null
  freight_charges: number | null
  estimated_delivery_days: number | null
  estimated_delivery_date: string | null
  cod_charges: number | null
  fuel_surcharge: number | null
  [key: string]: unknown
}

export interface VamashipRateResponse {
  results: VamashipRateResult[] | null
  [key: string]: unknown
}

export function transformRate(raw: VamashipRateResult): Rate {
  return {
    id: raw.courier_id != null ? String(raw.courier_id) : undefined,
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.courier_name ?? undefined,
    currency: 'INR',
    totalAmount: parseDecimal(raw.total_charges),
    transitDays: raw.estimated_delivery_days != null ? Math.ceil(raw.estimated_delivery_days) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    metadata: raw as Record<string, unknown>,
  }
}
