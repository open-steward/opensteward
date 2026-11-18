import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

// Response from POST /v3.1/CustomCarrier/rate
export interface LogiwaRateItem {
  carrier?: string | null
  shippingOption?: string | null
  shippingOptionName?: string | null
  currency?: string | null
  totalAmount?: number | null
  retailAmount?: number | null
  estimatedDays?: number | null
  expectedDeliveryDate?: string | null
  [key: string]: unknown
}

export interface LogiwaRateResponse {
  shipmentOrderIdentifier?: string | null
  shipmentOrderCode?: string | null
  rateList?: LogiwaRateItem[]
  isSuccessful?: boolean
  message?: string[]
  [key: string]: unknown
}

export function transformRate(raw: LogiwaRateItem): Rate {
  const totalAmount = parseDecimal(raw.totalAmount)
  const retailAmount = parseDecimal(raw.retailAmount)

  return {
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.shippingOption ?? undefined,
    serviceName: raw.shippingOptionName ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: totalAmount != null ? Math.round(totalAmount * 100) : undefined,
    retailAmount: retailAmount != null ? Math.round(retailAmount * 100) : undefined,
    transitDays: raw.estimatedDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.expectedDeliveryDate),
    metadata: raw as Record<string, unknown>,
  }
}
