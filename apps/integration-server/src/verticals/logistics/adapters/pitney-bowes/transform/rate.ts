import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface PitneyBowesRateDetail {
  carrier: string
  serviceId: string
  parcelType?: string
  totalCarrierCharge?: number
  currencyCode?: string
  deliveryCommitment?: {
    estimatedDeliveryDateTime?: string
    minEstimatedNumberOfDays?: number
    maxEstimatedNumberOfDays?: number
  }
  [key: string]: unknown
}

export interface PitneyBowesRateResponse {
  rates: PitneyBowesRateDetail[]
  [key: string]: unknown
}

export function transformRate(raw: PitneyBowesRateDetail): Rate {
  return {
    id: undefined,
    carrierId: 'pitney-bowes',
    serviceCode: raw.serviceId ?? undefined,
    serviceName: raw.serviceId ?? undefined,
    currency: raw.currencyCode ?? 'USD',
    totalAmount: parseDecimal(raw.totalCarrierCharge),
    transitDays: raw.deliveryCommitment?.maxEstimatedNumberOfDays,
    estimatedDeliveryAt: toISODate(raw.deliveryCommitment?.estimatedDeliveryDateTime),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
