import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Aramex ME raw types ────────────────────────────────────────────────────
//
// Returned by POST RateCalculator/CalculateRate (JSON/REST binding of the
// SOAP RateCalculatorResponse).  Only TotalAmount is guaranteed; the
// additional fields below appear when the v2 REST envelope includes them.

export interface AramexMeMoney {
  CurrencyCode: string | null
  Value: number | null
  [key: string]: unknown
}

export interface AramexMeRateCalculatorResponse {
  TotalAmount: AramexMeMoney | null
  /** Optional: estimated delivery date as ISO string or Aramex WCF "/Date(...)/" */
  DeliveryDate?: string | null
  /** Optional: transit / delivery days */
  TransitDays?: number | null
  HasErrors: boolean
  Notifications: unknown[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(
  raw: AramexMeRateCalculatorResponse,
  serviceCode?: string,
  serviceName?: string,
): Rate {
  return {
    carrierId: 'aramex-me',
    serviceCode: serviceCode ?? undefined,
    serviceName: serviceName ?? undefined,
    currency: raw.TotalAmount?.CurrencyCode ?? undefined,
    totalAmount: parseDecimal(raw.TotalAmount?.Value),
    transitDays: raw.TransitDays ?? undefined,
    deliveryDays: raw.TransitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.DeliveryDate),
    metadata: raw as Record<string, unknown>,
  }
}
