import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'
import { CARGUS_DEFAULT_CURRENCY } from '../constants'

/**
 * Raw rate estimate as returned by the Cargus price-calculation endpoint.
 * Cargus returns price quotes broken down by service type.
 */
export interface CargusRate {
  ServiceId?: number | null
  ServiceName?: string | null
  TotalPrice?: number | null
  BasePrice?: number | null
  Currency?: string | null
  EstimatedDeliveryDays?: number | null
  [key: string]: unknown
}

export function transformRate(raw: CargusRate): Rate {
  return {
    id: raw.ServiceId != null ? String(raw.ServiceId) : undefined,
    carrierId: 'cargus',
    serviceCode: raw.ServiceId != null ? String(raw.ServiceId) : undefined,
    serviceName: raw.ServiceName ?? undefined,
    currency: raw.Currency ?? CARGUS_DEFAULT_CURRENCY,
    totalAmount: parseDecimal(raw.TotalPrice),
    retailAmount: parseDecimal(raw.BasePrice),
    transitDays: raw.EstimatedDeliveryDays ?? undefined,
    deliveryDays: raw.EstimatedDeliveryDays ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
