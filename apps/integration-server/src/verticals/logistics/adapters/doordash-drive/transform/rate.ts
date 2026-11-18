import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface DoordashQuote {
  external_delivery_id?: string
  fee?: number | null
  currency?: string | null
  dropoff_time_estimated?: string | null
  [key: string]: unknown
}

export function transformRate(raw: DoordashQuote): Rate {
  return {
    id: raw.external_delivery_id,
    carrierId: 'doordash-drive',
    serviceCode: 'doordash_drive',
    serviceName: 'DoorDash Drive',
    currency: raw.currency ?? undefined,
    totalAmount: raw.fee != null ? raw.fee / 100 : undefined,
    estimatedDeliveryAt: toISODate(raw.dropoff_time_estimated),
    metadata: raw as Record<string, unknown>,
  }
}
