import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

/**
 * A single entry from the Transportify GET /deliveries/get_quote response.
 */
export interface TransportifyQuoteEntry {
  vehicle_type_id: number | null
  vehicle_type_name: string | null
  total_fees: number | null
  currency: string | null
  distance_fees: number | null
  way_point_fees: number | null
  cod_pod_fees: number | null
  extra_fees: number | null
  surcharges_fees: number | null
  [key: string]: unknown
}

export function transformRate(raw: TransportifyQuoteEntry): Rate {
  return {
    id: raw.vehicle_type_id != null ? String(raw.vehicle_type_id) : undefined,
    carrierId: 'transportify',
    serviceCode: raw.vehicle_type_id != null ? String(raw.vehicle_type_id) : undefined,
    serviceName: raw.vehicle_type_name ?? undefined,
    currency: (raw.currency ?? 'PHP') as Rate['currency'],
    totalAmount: parseDecimal(raw.total_fees),
    metadata: raw as Record<string, unknown>,
  }
}
