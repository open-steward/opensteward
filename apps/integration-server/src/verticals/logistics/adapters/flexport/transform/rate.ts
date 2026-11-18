import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface FlexportRateDetail {
  id?: string
  carrier_name?: string
  service_type?: string
  amount?: number
  currency?: string
  transit_days?: number
  estimated_arrival_date?: string
  [key: string]: unknown
}

export interface FlexportRateResponse {
  data: FlexportRateDetail[]
  [key: string]: unknown
}

export function transformRate(raw: FlexportRateDetail): Rate {
  return {
    id: raw.id ? String(raw.id) : undefined,
    carrierId: 'flexport',
    serviceCode: raw.service_type ?? undefined,
    serviceName: raw.carrier_name ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.amount),
    transitDays: raw.transit_days,
    estimatedDeliveryAt: toISODate(raw.estimated_arrival_date),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
