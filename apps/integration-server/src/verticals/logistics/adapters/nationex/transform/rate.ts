import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Nationex raw types ─────────────────────────────────────────────────────

export interface NationexSurchargeCharge {
  Id?: string | null
  Charge?: number | null
  NameEn?: string | null
  NameFr?: string | null
  [key: string]: unknown
}

export interface NationexTaxCharge {
  Id?: string | null
  Charge?: number | null
  Rate?: number | null
  NameEn?: string | null
  NameFr?: string | null
  [key: string]: unknown
}

export interface NationexRatesDetail {
  BasePrice?: number | null
  SurchargeCharges?: NationexSurchargeCharge[] | null
  TaxCharges?: NationexTaxCharge[] | null
  AccessoryCharges?: NationexSurchargeCharge[] | null
  NCVCharge?: number | null
  FuelRate?: number | null
  FuelCharge?: number | null
  SubTotal?: number | null
  Total?: number | null
  TotalBillableWeight?: number | null
  BillingZone?: string | null
  DelayTransitDays?: number | null
  EstimatedDeliveryDate?: string | null
  IsGreen?: boolean | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Nationex returns a single DTORatesDetail per POST /Customers/{id}/rates call
 * (not an array). The response covers the Nationex ground service only.
 *
 * Amounts: Nationex returns dollar amounts as floats; we convert to minor units
 * (cents) by multiplying by 100 and rounding.
 */
export function transformRate(raw: NationexRatesDetail): Rate {
  const totalDollars = parseDecimal(raw.Total)
  const totalCents = totalDollars != null ? Math.round(totalDollars * 100) : undefined

  const baseDollars = parseDecimal(raw.BasePrice)
  const retailCents = baseDollars != null ? Math.round(baseDollars * 100) : undefined

  return {
    carrierId: 'nationex',
    serviceCode: 'nationex_ground',
    serviceName: 'Nationex Ground',
    currency: 'CAD',
    totalAmount: totalCents,
    retailAmount: retailCents,
    transitDays: raw.DelayTransitDays ?? undefined,
    deliveryDays: raw.DelayTransitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    isGuaranteedDelivery: false,
    metadata: raw as Record<string, unknown>,
  }
}
