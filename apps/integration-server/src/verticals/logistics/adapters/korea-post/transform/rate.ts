import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

// Korea Post business API — POST /rates (biz.epost.go.kr).
// NOTE: This endpoint is part of the contract-customer portal and is only
// accessible with a valid business API key; public documentation is behind login.
// Response shape is inferred from the adapter's observed API usage.

export interface KoreaPostRateRaw {
  id?: string | null
  service_code?: string | null
  code?: string | null
  service_name?: string | null
  name?: string | null
  currency?: string | null
  total?: number | null
  amount?: number | null
  retail_amount?: number | null
  transit_days?: number | null
  delivery_days?: number | null
  estimated_delivery_at?: string | null
  is_guaranteed?: boolean | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: KoreaPostRateRaw): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: 'korea-post',
    serviceCode: raw.service_code ?? raw.code ?? undefined,
    serviceName: raw.service_name ?? raw.name ?? undefined,
    currency: raw.currency ?? 'KRW',
    totalAmount: typeof raw.total === 'number'
      ? raw.total
      : typeof raw.amount === 'number'
        ? raw.amount
        : undefined,
    retailAmount: typeof raw.retail_amount === 'number' ? raw.retail_amount : undefined,
    transitDays: typeof raw.transit_days === 'number' ? raw.transit_days : undefined,
    deliveryDays: typeof raw.delivery_days === 'number' ? raw.delivery_days : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    isGuaranteedDelivery: typeof raw.is_guaranteed === 'boolean' ? raw.is_guaranteed : undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
