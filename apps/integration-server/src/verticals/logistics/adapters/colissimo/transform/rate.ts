import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Colissimo raw types ───────────────────────────────────────────────────

export interface ColissimoRate {
  id: string | null
  product_code: string
  product_name: string | null
  price: number | null
  currency: string | null
  delivery_days: number | null
  delivery_date: string | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: ColissimoRate): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: 'colissimo',
    serviceCode: raw.product_code ?? undefined,
    serviceName: raw.product_name ?? undefined,
    currency: raw.currency ?? 'EUR',
    totalAmount: parseDecimal(raw.price),
    transitDays: raw.delivery_days ?? undefined,
    deliveryDays: raw.delivery_days ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
