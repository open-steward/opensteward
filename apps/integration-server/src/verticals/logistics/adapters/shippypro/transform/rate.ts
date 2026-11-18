import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * ShippyPro rate object (element of the "Rates" array in GetRates response).
 */
export interface ShippyProRate {
  CarrierId?: string | number | null
  CarrierName?: string | null
  ServiceId?: string | number | null
  ServiceName?: string | null
  Price?: number | string | null
  Currency?: string | null
  DeliveryDays?: number | null
  EstimatedDeliveryDate?: string | null
  IsGuaranteed?: boolean | null
  CreatedAt?: string | null
  [key: string]: unknown
}

export function transformRate(raw: ShippyProRate): Rate {
  return {
    id: raw.ServiceId !== undefined && raw.ServiceId !== null ? String(raw.ServiceId) : undefined,
    carrierId: raw.CarrierName ?? (raw.CarrierId !== undefined && raw.CarrierId !== null ? String(raw.CarrierId) : undefined),
    serviceCode: raw.ServiceId !== undefined && raw.ServiceId !== null ? String(raw.ServiceId) : undefined,
    serviceName: raw.ServiceName ?? undefined,
    currency: raw.Currency ?? undefined,
    totalAmount: parseDecimal(raw.Price),
    transitDays: raw.DeliveryDays ?? undefined,
    deliveryDays: raw.DeliveryDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    isGuaranteedDelivery: raw.IsGuaranteed ?? undefined,
    createdAt: toISODate(raw.CreatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
