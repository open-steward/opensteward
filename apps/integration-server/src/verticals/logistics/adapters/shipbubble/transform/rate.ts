import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ShipbubbleCourierRate {
  courier_id?: string | number | null
  courier_name?: string | null
  rate_card_amount?: number | null
  total?: number | null
  pickup_eta_time?: string | null
  delivery_eta_time?: string | null
  is_cod_available?: boolean | null
  tracking_level?: number | null
  service_type?: string | null
  [key: string]: unknown
}

export function transformRate(raw: ShipbubbleCourierRate): Rate {
  const totalDecimal = parseDecimal(raw.total)
  const retailDecimal = parseDecimal(raw.rate_card_amount)
  return {
    id:
      raw.courier_id !== null && raw.courier_id !== undefined ? String(raw.courier_id) : undefined,
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.courier_name ?? undefined,
    // Shipbubble amounts are in the account currency (NGN by default); convert to minor units
    totalAmount: totalDecimal != null ? Math.round(totalDecimal * 100) : undefined,
    retailAmount: retailDecimal != null ? Math.round(retailDecimal * 100) : undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_eta_time),
    metadata: raw as Record<string, unknown>,
  }
}
