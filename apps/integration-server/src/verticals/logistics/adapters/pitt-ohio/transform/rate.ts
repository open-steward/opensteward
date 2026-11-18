import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── PITT OHIO raw types ─────────────────────────────────────────────────

export interface PittOhioRate {
  quote_id: string | null
  service_code: string | null
  service_name: string | null
  total_charge: number | null
  currency: string | null
  transit_days: number | null
  delivery_date: string | null
  guaranteed: boolean | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: PittOhioRate): Rate {
  return {
    id: raw.quote_id ?? undefined,
    carrierId: 'pitt-ohio',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.total_charge),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    isGuaranteedDelivery: raw.guaranteed ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
