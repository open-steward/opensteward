import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ShipKaroCourierRate {
  courier_company_id?: number | null
  courier_name?: string | null
  courier_type?: string | null
  freight_charge?: number | null
  cod_charges?: number | null
  rate?: number | null
  estimated_delivery_days?: string | number | null
  etd?: string | null
  is_surface?: boolean | null
  min_weight?: number | null
  [key: string]: unknown
}

export interface ShipKaroRateResponse {
  data?: {
    available_courier_companies?: ShipKaroCourierRate[] | null
    [key: string]: unknown
  } | null
  // Some endpoints return rates at root level
  available_courier_companies?: ShipKaroCourierRate[] | null
  [key: string]: unknown
}

export function transformRate(raw: ShipKaroCourierRate): Rate {
  const transitDaysRaw = parseDecimal(raw.estimated_delivery_days)
  return {
    id: raw.courier_company_id != null ? String(raw.courier_company_id) : undefined,
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.courier_type ?? undefined,
    serviceName: raw.courier_name ?? undefined,
    currency: 'INR',
    totalAmount: parseDecimal(raw.rate) ?? parseDecimal(raw.freight_charge),
    transitDays: transitDaysRaw != null ? Math.ceil(transitDaysRaw) : undefined,
    estimatedDeliveryAt: toISODate(raw.etd),
    metadata: raw as Record<string, unknown>,
  }
}
