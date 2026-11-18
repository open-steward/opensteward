import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface VehoRate {
  service_code?: string | null
  service_name?: string | null
  total_amount?: number | null
  currency?: string | null
  estimated_delivery_at?: string | null
  [key: string]: unknown
}

export function transformRate(raw: VehoRate): Rate {
  return {
    carrierId: 'veho',
    serviceCode: raw.service_code ?? 'veho',
    serviceName: raw.service_name ?? 'Veho',
    currency: raw.currency ?? 'USD',
    totalAmount: raw.total_amount ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    metadata: raw as Record<string, unknown>,
  }
}
