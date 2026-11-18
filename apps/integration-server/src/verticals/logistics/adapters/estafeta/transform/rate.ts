import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Estafeta raw types ────────────────────────────────────────────────────

export interface EstafetaRate {
  quote_id: string | null
  service_code: string | null
  service_name: string | null
  total_amount: number | null
  currency: string | null
  transit_days: number | null
  delivery_date: string | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: EstafetaRate): Rate {
  return {
    id: raw.quote_id ?? undefined,
    carrierId: 'estafeta',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'MXN',
    totalAmount: parseDecimal(raw.total_amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
