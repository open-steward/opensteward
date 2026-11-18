import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ShiprocketCourierRate {
  courier_company_id: number
  courier_name: string | null
  courier_type: string | null
  freight_charge: number | null
  cod_charges: number | null
  rate: number | null
  estimated_delivery_days: string | null
  etd: string | null
  is_surface: boolean | null
  is_rto_address_available: boolean | null
  min_weight: number | null
  [key: string]: unknown
}

export interface ShiprocketRateResponse {
  data: {
    available_courier_companies: ShiprocketCourierRate[] | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformRate(raw: ShiprocketCourierRate): Rate {
  return {
    id: String(raw.courier_company_id),
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.courier_type ?? undefined,
    serviceName: raw.courier_name ?? undefined,
    currency: 'INR',
    totalAmount: parseDecimal(raw.rate),
    transitDays: parseDecimal(raw.estimated_delivery_days) != null
      ? Math.ceil(parseDecimal(raw.estimated_delivery_days)!)
      : undefined,
    estimatedDeliveryAt: toISODate(raw.etd),
    metadata: raw as Record<string, unknown>,
  }
}
