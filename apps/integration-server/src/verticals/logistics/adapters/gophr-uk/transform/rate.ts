import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * Raw response from POST /quotes (Gophr UK V2 Commercial API).
 */
export interface GophrUkQuoteResponse {
  quote_id?: string | null
  price_net?: number | null
  price_gross?: number | null
  currency?: string | null
  /** Estimated delivery window in minutes from pickup */
  delivery_eta_minutes?: number | null
  /** Estimated pickup ETA (ISO-8601) */
  pickup_eta?: string | null
  /** Estimated delivery ETA (ISO-8601) */
  delivery_eta?: string | null
  service_name?: string | null
  service_code?: string | null
  [key: string]: unknown
}

/**
 * Some endpoints return a `quotes` array wrapper.
 */
export interface GophrUkQuoteListResponse {
  quotes?: GophrUkQuoteResponse[]
  [key: string]: unknown
}

export function transformRate(raw: GophrUkQuoteResponse): Rate {
  return {
    id: raw.quote_id ?? undefined,
    carrierId: 'gophr-uk',
    serviceCode: raw.service_code ?? 'gophr-uk',
    serviceName: raw.service_name ?? 'Gophr UK',
    currency: (raw.currency ?? 'GBP') as string,
    totalAmount: raw.price_gross ?? raw.price_net ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_eta),
    metadata: raw as Record<string, unknown>,
  }
}
