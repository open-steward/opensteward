import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Canada Post raw types ──────────────────────────────────────────────────

/**
 * A single price-quote element returned by
 * POST /rs/ship/price (Accept: application/vnd.cpc.ship.rate-v4+xml)
 */
export interface CanadaPostPriceQuote {
  'service-code'?: string | null
  'service-name'?: string | null
  /** Base price before tax */
  base?: string | number | null
  /** Total cost including all taxes and adjustments */
  due?: string | number | null
  'guaranteed-delivery'?: string | boolean | null
  /** Expected transit time in business days */
  'expected-transit-time'?: string | number | null
  /** YYYY-MM-DD expected delivery date */
  'expected-delivery-date'?: string | null
  [key: string]: unknown
}

export interface CanadaPostRateResponse {
  'price-quotes'?: {
    'price-quote'?: CanadaPostPriceQuote | CanadaPostPriceQuote[]
  } | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: CanadaPostPriceQuote): Rate {
  const totalCents = parseDecimal(raw['due'])
  const retailCents = parseDecimal(raw['base'])
  const transitDays = parseDecimal(raw['expected-transit-time'])

  const guaranteed =
    raw['guaranteed-delivery'] === true ||
    raw['guaranteed-delivery'] === 'true' ||
    raw['guaranteed-delivery'] === '1'

  return {
    carrierId: 'canada-post',
    serviceCode: raw['service-code'] ?? undefined,
    serviceName: raw['service-name'] ?? undefined,
    currency: 'CAD',
    // Canada Post returns amounts as decimal dollar strings (e.g. "12.45");
    // convert to integer minor units (cents).
    totalAmount: totalCents != null ? Math.round(totalCents * 100) : undefined,
    retailAmount: retailCents != null ? Math.round(retailCents * 100) : undefined,
    transitDays: transitDays != null ? Math.round(transitDays) : undefined,
    deliveryDays: transitDays != null ? Math.round(transitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw['expected-delivery-date']),
    isGuaranteedDelivery: guaranteed,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRateResponse(raw: CanadaPostRateResponse): Rate[] {
  const quoteOrArray = raw['price-quotes']?.['price-quote']
  if (!quoteOrArray) return []
  const quotes = Array.isArray(quoteOrArray) ? quoteOrArray : [quoteOrArray]
  return quotes.map(transformRate)
}
