import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A single service-level entry within an R+L Carriers RateQuote response.
 */
export interface RlCarriersServiceLevel {
  Title?: string
  Code?: string
  QuoteNumber?: string
  ServiceDays?: number
  Charge?: number
  NetCharge?: number
  [key: string]: unknown
}

/**
 * A single line-item charge within the rate quote.
 */
export interface RlCarriersCharge {
  Type?: string
  Title?: string
  Weight?: number
  Rate?: number
  Amount?: number
  [key: string]: unknown
}

/**
 * The top-level RateQuote object returned by R+L Carriers.
 * POST /RateQuote  →  { RateQuote: RlCarriersRateQuoteResponse }
 */
export interface RlCarriersRateQuoteResponse {
  QuoteNumber?: string
  PickupDate?: string
  Origin?: {
    City?: string
    StateOrProvince?: string
    ZipOrPostalCode?: string
    CountryCode?: string
    [key: string]: unknown
  }
  Destination?: {
    City?: string
    StateOrProvince?: string
    ZipOrPostalCode?: string
    CountryCode?: string
    [key: string]: unknown
  }
  ServiceLevels?: RlCarriersServiceLevel[]
  Charges?: RlCarriersCharge[]
  Errors?: string[]
  Messages?: string[]
  [key: string]: unknown
}

export interface RlCarriersRateResponse {
  RateQuote?: RlCarriersRateQuoteResponse
  [key: string]: unknown
}

export function transformRateQuote(raw: RlCarriersRateQuoteResponse): Rate[] {
  const serviceLevels = raw.ServiceLevels ?? []

  if (serviceLevels.length === 0) {
    // Return a single aggregate rate from Charges total if no service levels
    const totalNetCharge = (raw.Charges ?? []).reduce<number>(
      (sum, c) => sum + (parseDecimal(c.Amount) ?? 0),
      0,
    )
    return [
      {
        id: raw.QuoteNumber ?? undefined,
        carrierId: 'rl-carriers',
        serviceCode: 'STANDARD',
        serviceName: 'R+L Carriers Standard LTL',
        currency: 'USD',
        totalAmount: totalNetCharge > 0 ? totalNetCharge : undefined,
        estimatedDeliveryAt: toISODate(raw.PickupDate),
        isGuaranteedDelivery: false,
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return serviceLevels.map((level): Rate => {
    const netCharge = parseDecimal(level.NetCharge ?? level.Charge)
    return {
      id: level.QuoteNumber ?? raw.QuoteNumber ?? undefined,
      carrierId: 'rl-carriers',
      serviceCode: level.Code ?? undefined,
      serviceName: level.Title ?? undefined,
      currency: 'USD',
      totalAmount: netCharge,
      transitDays: typeof level.ServiceDays === 'number' ? level.ServiceDays : undefined,
      isGuaranteedDelivery: false,
      metadata: raw as Record<string, unknown>,
    }
  })
}
