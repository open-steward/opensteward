import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface UberDirectQuote {
  id?: string
  fee?: number | null
  currency?: string | null
  duration?: number | null
  pickup_duration?: number | null
  dropoff_eta?: string | null
  expires?: string | null
  [key: string]: unknown
}

export function transformRate(raw: UberDirectQuote): Rate {
  return {
    id: raw.id,
    carrierId: 'uber-direct',
    serviceCode: 'uber_direct',
    serviceName: 'Uber Direct',
    currency: raw.currency ?? undefined,
    totalAmount: raw.fee != null ? raw.fee / 100 : undefined,
    estimatedDeliveryAt: toISODate(raw.dropoff_eta),
    metadata: raw as Record<string, unknown>,
  }
}
