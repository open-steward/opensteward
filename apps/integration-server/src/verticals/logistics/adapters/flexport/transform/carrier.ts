import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface FlexportCarrierServiceRaw {
  code?: string
  name?: string
  transit_days_min?: number
  transit_days_max?: number
  is_guaranteed?: boolean
  [key: string]: unknown
}

export interface FlexportCarrierResponse {
  id?: string
  name?: string
  scac?: string
  carrier_code?: string
  tracking_url_template?: string
  services?: FlexportCarrierServiceRaw[]
  is_active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCarrier(raw: FlexportCarrierResponse): Carrier {
  const services = (raw.services ?? []).map((svc) => ({
    code: svc.code ?? 'UNKNOWN',
    name: svc.name ?? undefined,
    transitDaysMin: svc.transit_days_min ?? undefined,
    transitDaysMax: svc.transit_days_max ?? undefined,
    isGuaranteed: svc.is_guaranteed ?? undefined,
  }))

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    code: raw.scac ?? raw.carrier_code ?? undefined,
    trackingUrlTemplate: raw.tracking_url_template ?? undefined,
    services: services.length > 0 ? services : undefined,
    isActive: raw.is_active ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
