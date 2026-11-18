import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

export interface DelivereeQuoteItem {
  vehicle_type_id?: number | null
  vehicle_type_name?: string | null
  total_fees?: number | null
  currency?: string | null
  [key: string]: unknown
}

export function transformQuoteItem(raw: DelivereeQuoteItem): Rate {
  return {
    id: raw.vehicle_type_id != null ? String(raw.vehicle_type_id) : undefined,
    carrierId: 'deliveree',
    serviceCode:
      raw.vehicle_type_id != null ? String(raw.vehicle_type_id) : undefined,
    serviceName: raw.vehicle_type_name ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.total_fees),
    metadata: raw as Record<string, unknown>,
  }
}
