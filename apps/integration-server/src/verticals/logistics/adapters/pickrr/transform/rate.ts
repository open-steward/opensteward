import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface PickrrCourierRate {
  courier_name: string | null
  courier_id: number | string | null
  rate: number | null
  freight_charge: number | null
  cod_charge: number | null
  estimated_delivery_days: number | string | null
  etd: string | null
  service_type: string | null
  [key: string]: unknown
}

export interface PickrrRateResponse {
  success: boolean | null
  courier_list: PickrrCourierRate[] | null
  available_couriers: PickrrCourierRate[] | null
  [key: string]: unknown
}

export function transformRate(raw: PickrrCourierRate): Rate {
  const transitDays = parseDecimal(raw.estimated_delivery_days)

  return {
    id: String(raw.courier_id ?? raw.courier_name ?? ''),
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.service_type ?? raw.courier_name ?? undefined,
    serviceName: raw.courier_name ?? undefined,
    currency: 'INR',
    totalAmount: parseDecimal(raw.rate ?? raw.freight_charge),
    transitDays: transitDays != null ? Math.ceil(transitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw.etd),
    metadata: raw as Record<string, unknown>,
  }
}
