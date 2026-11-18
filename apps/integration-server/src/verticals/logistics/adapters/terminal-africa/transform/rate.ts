import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface TerminalAfricaRate {
  id?: string | null
  rate_id?: string | null
  amount?: number | string | null
  currency?: string | null
  carrier_id?: string | null
  carrier_name?: string | null
  carrier_slug?: string | null
  carrier_logo?: string | null
  carrier_rate_description?: string | null
  delivery_time?: string | null
  delivery_eta?: number | null
  delivery_date?: string | null
  pickup_time?: string | null
  pickup_eta?: number | null
  includes_insurance?: boolean | null
  insurance_fee?: number | null
  shipment?: string | null
  used?: boolean | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: TerminalAfricaRate): Rate {
  return {
    id: raw.rate_id ?? raw.id ?? undefined,
    carrierId: raw.carrier_slug ?? raw.carrier_id ?? undefined,
    serviceCode: raw.carrier_rate_description ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.amount),
    transitDays: raw.delivery_eta != null ? Math.ceil(raw.delivery_eta / 1440) : undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
