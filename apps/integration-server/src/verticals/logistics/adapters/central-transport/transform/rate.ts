/**
 * Central Transport rate-quote transforms.
 *
 * Piyovi POST /v1/shipment/rate returns carrier-specific rate quotes.
 * The response shape depends on which carriers are enabled in the account;
 * for Central Transport LTL quotes, the relevant fields are mapped here.
 */
import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Raw Piyovi types ────────────────────────────────────────────────────────

export interface PiyoviRateQuote {
  carrierId?: string
  carrierCode?: string
  serviceCode?: string
  serviceName?: string
  totalCharge?: number
  baseCharge?: number
  fuelSurcharge?: number
  currency?: string
  transitDays?: number
  transitTime?: number
  estimatedDeliveryDate?: string
  guaranteed?: boolean
  isGuaranteed?: boolean
  [key: string]: unknown
}

export interface PiyoviRateResponse {
  quotes?: PiyoviRateQuote[]
  data?: PiyoviRateQuote[]
  rates?: PiyoviRateQuote[]
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformRate(raw: PiyoviRateQuote): Rate {
  const transitDays = raw.transitDays ?? raw.transitTime
  return {
    id: undefined,
    carrierId: 'central-transport',
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: (raw.currency ?? 'USD') as string,
    totalAmount: parseDecimal(raw.totalCharge),
    transitDays: typeof transitDays === 'number' ? Math.round(transitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.guaranteed ?? raw.isGuaranteed,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function extractQuotes(raw: PiyoviRateResponse): PiyoviRateQuote[] {
  return raw.quotes ?? raw.data ?? raw.rates ?? []
}
