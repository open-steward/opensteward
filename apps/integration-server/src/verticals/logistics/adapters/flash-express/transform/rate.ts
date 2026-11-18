import type { Rate } from '../../../schema/rate'

// ─── Flash Express raw types ───────────────────────────────────────────────

/**
 * Response data from POST /open/v1/orders/estimate_rate.
 * Currency is in "satang" / smallest unit (e.g. 1 THB = 100 cents).
 */
export interface FlashExpressEstimateRateData {
  estimatePrice: number | null
  pricePolicy: number | null
  upCountry: boolean | null
  upCountryAmount: number | null
  insureDeclareValue: number | null
  valueInsuranceFee: number | null
  speedFee: number | null
  codTransferFee: number | null
  opdInsureEnabled: boolean | null
  opdInsureFee: number | null
  expressCategory: number | null
  insured: boolean | null
  [key: string]: unknown
}

export interface FlashExpressEstimateRateResponse {
  code: number
  message: string
  data: FlashExpressEstimateRateData
}

// ─── Service code mapping ────────────────────────────────────────────────────

/**
 * Maps Flash Express expressCategory integer to a human-readable service name.
 * Source: open-docs.flashexpress.com — expressCategory values.
 */
function mapServiceCode(expressCategory: number | null): string | undefined {
  switch (expressCategory) {
    case 1: return 'flash_standard'
    case 2: return 'flash_on_time'
    case 4: return 'flash_bulky'
    case 5: return 'flash_fruit'
    case 6: return 'flash_happy_return'
    case 7: return 'flash_happy_return_bulky'
    default: return undefined
  }
}

function mapServiceName(expressCategory: number | null): string | undefined {
  switch (expressCategory) {
    case 1: return 'Flash Standard'
    case 2: return 'Flash On-Time Delivery'
    case 4: return 'Flash Bulky'
    case 5: return 'Flash Fruit Delivery'
    case 6: return 'Flash Happy Return'
    case 7: return 'Flash Happy Return Bulky'
    default: return undefined
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: FlashExpressEstimateRateData): Rate {
  const serviceCode = mapServiceCode(raw.expressCategory)

  return {
    carrierId: 'flash-express',
    serviceCode,
    serviceName: mapServiceName(raw.expressCategory),
    // Flash Express prices are in smallest currency unit (satang for THB)
    currency: 'THB',
    totalAmount: raw.estimatePrice ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
