import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── Aramex raw types ───────────────────────────────────────────────────────

export interface AramexRateAmount {
  Value: number
  CurrencyCode: string
  [key: string]: unknown
}

export interface AramexRateResult {
  Amount: number
  OtherAmount1: number | null
  OtherAmount2: number | null
  DeliveryDate: string | null
  TransitDays: number | null
  ProductGroup: string | null
  ProductType: string | null
  [key: string]: unknown
}

export interface AramexRateResponse {
  TotalAmount: AramexRateAmount | null
  RateDetails: AramexRateResult | null
  HasErrors: boolean
  Notifications: unknown[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: AramexRateResponse): Rate {
  const details = raw.RateDetails

  return {
    id: details?.ProductType ?? undefined,
    carrierId: 'aramex',
    serviceCode: details?.ProductType ?? undefined,
    serviceName: details?.ProductGroup ?? undefined,
    currency: raw.TotalAmount?.CurrencyCode ?? undefined,
    totalAmount: parseDecimal(raw.TotalAmount?.Value),
    transitDays: details?.TransitDays ?? undefined,
    deliveryDays: details?.TransitDays ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
