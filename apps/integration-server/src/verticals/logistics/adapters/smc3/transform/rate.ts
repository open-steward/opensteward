import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * SMC3 RateWare XL — rate response for a single carrier/service.
 * Shape from POST /ratequote or the RWXL rating endpoint.
 */
export interface Smc3RateResult {
  scac?: string | null
  carrierName?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  totalCharge?: number | string | null
  currency?: string | null
  transitDays?: number | null
  estimatedDeliveryDate?: string | null
  guaranteedDelivery?: boolean | null
  effectiveDate?: string | null
  [key: string]: unknown
}

export interface Smc3RateResponse {
  rates?: Smc3RateResult[] | null
  messageStatus?: { status?: string | null; message?: string | null } | null
  [key: string]: unknown
}

export function transformRate(raw: Smc3RateResult): Rate {
  return {
    carrierId: raw.scac ?? undefined,
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? raw.carrierName ?? undefined,
    currency: (raw.currency ?? 'USD') as string,
    totalAmount: parseDecimal(raw.totalCharge) ?? undefined,
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.guaranteedDelivery ?? undefined,
    createdAt: toISODate(raw.effectiveDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRateResponse(raw: Smc3RateResponse): Rate[] {
  return (raw.rates ?? []).map(transformRate)
}
