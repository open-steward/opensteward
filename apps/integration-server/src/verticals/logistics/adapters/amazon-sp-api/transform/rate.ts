import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

/**
 * A single rate offering returned inside `GetRatesResult.rates[]`
 * from POST /shipping/v2/shipments/rates.
 *
 * Reference: https://developer-docs-amazon-shipping.readme.io/apis/docs/shipping-api-v2-reference
 */
export interface SpApiRate {
  rateId?: string | null
  carrierId?: string | null
  carrierName?: string | null
  serviceId?: string | null
  serviceName?: string | null
  /** e.g. { value: 9.99, unit: 'USD' } */
  totalCharge?: { value?: number | null; unit?: string | null } | null
  /** e.g. { deliveryWindow: { start: ISO, end: ISO }, pickupWindow: {...} } */
  promise?: {
    deliveryWindow?: { start?: string | null; end?: string | null } | null
  } | null
  [key: string]: unknown
}

/**
 * Top-level response envelope from POST /shipping/v2/shipments/rates.
 */
export interface SpApiGetRatesResponse {
  requestToken?: string | null
  rates?: SpApiRate[]
  ineligibleRates?: SpApiRate[]
  [key: string]: unknown
}

export function transformRate(raw: SpApiRate): Rate {
  const chargeValue = parseDecimal(raw.totalCharge?.value)

  return {
    id: raw.rateId ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    serviceCode: raw.serviceId ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    // SP-API returns the currency in totalCharge.unit (ISO 4217)
    currency: (raw.totalCharge?.unit as string | undefined) ?? undefined,
    // Amount stored as minor units per canonical schema convention;
    // SP-API returns the decimal amount so we multiply by 100.
    totalAmount: chargeValue != null ? Math.round(chargeValue * 100) : undefined,
    estimatedDeliveryAt: toISODate(raw.promise?.deliveryWindow?.end ?? null),
    metadata: raw as Record<string, unknown>,
  }
}
