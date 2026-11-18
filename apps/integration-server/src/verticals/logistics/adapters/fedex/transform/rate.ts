import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface FedExRateReplyDetail {
  serviceType: string
  serviceName: string
  ratedShipmentDetails: FedExRatedShipmentDetail[]
  commit?: {
    dateDetail?: {
      dayCxsFormat?: string
    }
  }
  [key: string]: unknown
}

export interface FedExRatedShipmentDetail {
  rateType: string
  totalBaseCharge: number
  totalNetCharge: number
  shipmentRateDetail?: {
    currency?: string
  }
  [key: string]: unknown
}

export interface FedExRateResponse {
  output: {
    rateReplyDetails: FedExRateReplyDetail[]
  }
}

export function transformRate(raw: FedExRateReplyDetail): Rate {
  // Use the first rated shipment detail (usually ACCOUNT or LIST rate)
  const detail = raw.ratedShipmentDetails?.[0]
  const deliveryDate = raw.commit?.dateDetail?.dayCxsFormat

  return {
    id: undefined,
    carrierId: 'fedex',
    serviceCode: raw.serviceType ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency: detail?.shipmentRateDetail?.currency ?? undefined,
    totalAmount: parseDecimal(detail?.totalNetCharge),
    retailAmount: parseDecimal(detail?.totalBaseCharge),
    estimatedDeliveryAt: toISODate(deliveryDate),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
