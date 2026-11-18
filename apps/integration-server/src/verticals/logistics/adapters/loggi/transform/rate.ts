import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * A single rate / quotation option returned by:
 *   POST /v1/companies/{company_id}/quotes
 */
export interface LoggiQuoteOption {
  serviceType?: string | null
  serviceName?: string | null
  totalAmount?: number | null
  currency?: string | null
  /** Estimated transit days */
  transitDays?: number | null
  estimatedDeliveryDate?: string | null
  isGuaranteed?: boolean | null
  [key: string]: unknown
}

/**
 * Top-level quote response from the Loggi API.
 */
export interface LoggiQuoteResponse {
  options?: LoggiQuoteOption[] | null
  [key: string]: unknown
}

export function transformRate(raw: LoggiQuoteOption): Rate {
  return {
    carrierId: 'loggi',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: (raw.currency as string | undefined) ?? 'BRL',
    totalAmount: parseDecimal(raw.totalAmount),
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.isGuaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
