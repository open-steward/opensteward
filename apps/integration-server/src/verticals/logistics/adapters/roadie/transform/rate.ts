import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface RoadieEstimate {
  price?: number | null
  currency?: string | null
  estimated_delivery_time?: string | null
  [key: string]: unknown
}

export function transformRate(raw: RoadieEstimate): Rate {
  return {
    carrierId: 'roadie',
    serviceCode: 'roadie',
    serviceName: 'Roadie',
    currency: raw.currency ?? 'USD',
    totalAmount: raw.price ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_time),
    metadata: raw as Record<string, unknown>,
  }
}
