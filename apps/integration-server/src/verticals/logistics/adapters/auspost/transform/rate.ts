import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

export interface AusPostRateResult {
  service_code: string
  name: string
  price: number
  max_extra_cover?: number
  delivery_time?: string
  delivery_time_min_days?: number
  delivery_time_max_days?: number
  [key: string]: unknown
}

export interface AusPostRateResponse {
  postage_result: {
    service: AusPostRateResult
  } | {
    services: {
      service: AusPostRateResult[]
    }
  }
  [key: string]: unknown
}

export function transformRate(raw: AusPostRateResult): Rate {
  return {
    id: undefined,
    carrierId: 'auspost',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.name ?? undefined,
    currency: 'AUD',
    totalAmount: parseDecimal(raw.price),
    transitDays: raw.delivery_time_max_days,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
