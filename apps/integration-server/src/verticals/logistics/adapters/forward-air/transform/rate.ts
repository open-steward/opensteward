import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Forward Air raw types ────────────────────────────────────────────────
// Source: POST /ltlservices/v2/rest/waybills/quote (FAQuoteResponse XML/JSON)

export interface ForwardAirChargeLineItem {
  Code: string | null
  Description: string | null
  Zone: string | null
  ServiceLevel: string | null
  Amount: number | string | null
  [key: string]: unknown
}

export interface ForwardAirQuoteResponse {
  QuoteId?: string | null
  quoteDate?: string | null
  QuoteTotal?: number | string | null
  quoteTotal?: number | string | null
  TotalWeight?: number | string | null
  TransitDaysTotal?: number | string | null
  transitDaysTotal?: number | string | null
  ChargeLineItems?: ForwardAirChargeLineItem[] | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: ForwardAirQuoteResponse): Rate {
  const totalRaw = raw.QuoteTotal ?? raw.quoteTotal
  const totalAmount = parseDecimal(totalRaw)
  const transitRaw = raw.TransitDaysTotal ?? raw.transitDaysTotal
  const transitDays = parseDecimal(transitRaw)

  return {
    id: raw.QuoteId ?? undefined,
    carrierId: 'forward-air',
    serviceCode: 'ltl',
    serviceName: 'Forward Air Expedited LTL',
    currency: 'USD',
    totalAmount: totalAmount !== undefined ? Math.round(totalAmount * 100) : undefined,
    transitDays: transitDays !== undefined ? Math.round(transitDays) : undefined,
    estimatedDeliveryAt: toISODate(raw.quoteDate),
    isGuaranteedDelivery: false,
    createdAt: toISODate(raw.quoteDate),
    metadata: raw as Record<string, unknown>,
  }
}
