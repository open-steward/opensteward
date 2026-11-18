import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface SapTmCarrierServiceRaw {
  code?: string
  name?: string
  transitDaysMin?: number
  transitDaysMax?: number
  isGuaranteed?: boolean
  [key: string]: unknown
}

export interface SapTmCarrierResponse {
  id?: string
  carrierId?: string
  name?: string
  carrierName?: string
  code?: string
  scac?: string
  trackingUrlTemplate?: string
  services?: SapTmCarrierServiceRaw[]
  isActive?: boolean
  active?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCarrier(raw: SapTmCarrierResponse): Carrier {
  const id = raw.carrierId ?? raw.id ?? undefined
  const services = (raw.services ?? []).map((svc) => ({
    code: svc.code ?? 'UNKNOWN',
    name: svc.name ?? undefined,
    transitDaysMin: svc.transitDaysMin ?? undefined,
    transitDaysMax: svc.transitDaysMax ?? undefined,
    isGuaranteed: svc.isGuaranteed ?? undefined,
  }))

  return {
    id,
    name: raw.carrierName ?? raw.name ?? undefined,
    code: raw.scac ?? raw.code ?? undefined,
    trackingUrlTemplate: raw.trackingUrlTemplate ?? undefined,
    services: services.length > 0 ? services : undefined,
    isActive: raw.isActive ?? raw.active ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
