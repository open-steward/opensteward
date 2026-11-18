import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'
import { UPS_SERVICE_CODES } from '../constants'

export interface UPSRatedShipment {
  Service: {
    Code: string
    Description?: string
  }
  TotalCharges: {
    MonetaryValue: string
    CurrencyCode: string
  }
  BillingWeight?: {
    Weight: string
    UnitOfMeasurement?: {
      Code: string
    }
  }
  GuaranteedDelivery?: {
    BusinessDaysInTransit?: string
  }
  [key: string]: unknown
}

export interface UPSRateResponse {
  RateResponse: {
    RatedShipment: UPSRatedShipment[]
    [key: string]: unknown
  }
}

export function transformRate(raw: UPSRatedShipment): Rate {
  const serviceCode = raw.Service?.Code
  const transitDays = parseDecimal(raw.GuaranteedDelivery?.BusinessDaysInTransit)

  return {
    id: serviceCode,
    carrierId: 'UPS',
    serviceCode,
    serviceName: UPS_SERVICE_CODES[serviceCode] ?? raw.Service?.Description ?? undefined,
    currency: raw.TotalCharges?.CurrencyCode ?? undefined,
    totalAmount: parseDecimal(raw.TotalCharges?.MonetaryValue),
    transitDays: transitDays !== undefined ? Math.round(transitDays) : undefined,
    deliveryDays: transitDays !== undefined ? Math.round(transitDays) : undefined,
    isGuaranteedDelivery: raw.GuaranteedDelivery !== undefined ? true : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
