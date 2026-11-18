import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * Glovo price estimate returned by POST /orders/estimate.
 */
export interface GlovoEstimate {
  total?: {
    amount?: number | null
    currency?: string | null
  } | null
  deliveryTime?: number | null   // estimated delivery time in minutes
  estimatedAt?: string | null
  [key: string]: unknown
}

export function transformRate(raw: GlovoEstimate): Rate {
  return {
    carrierId: 'glovo',
    serviceCode: 'on_demand',
    serviceName: 'Glovo On-Demand',
    currency: (raw.total?.currency ?? undefined) as Rate['currency'],
    totalAmount: raw.total?.amount ?? undefined,
    transitDays: raw.deliveryTime != null ? Math.ceil(raw.deliveryTime / 60 / 24) : undefined,
    createdAt: toISODate(raw.estimatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
