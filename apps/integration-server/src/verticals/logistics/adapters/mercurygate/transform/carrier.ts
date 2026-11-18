import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface MercuryGateCarrierServiceRaw {
  code?: string
  serviceCode?: string
  name?: string
  serviceName?: string
  transitDaysMin?: number
  transitDaysMax?: number
  isGuaranteed?: boolean
  [key: string]: unknown
}

export interface MercuryGateCarrierResponse {
  id?: string
  carrierId?: string
  scac?: string
  name?: string
  carrierName?: string
  code?: string
  carrierCode?: string
  trackingUrlTemplate?: string
  services?: MercuryGateCarrierServiceRaw[]
  isActive?: boolean
  active?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCarrier(raw: MercuryGateCarrierResponse): Carrier {
  const id = raw.carrierId ?? raw.id ?? undefined
  const code = raw.scac ?? raw.carrierCode ?? raw.code ?? undefined
  const services = (raw.services ?? []).map((s) => ({
    code: s.serviceCode ?? s.code ?? 'UNKNOWN',
    name: s.serviceName ?? s.name ?? undefined,
    transitDaysMin: s.transitDaysMin ?? undefined,
    transitDaysMax: s.transitDaysMax ?? undefined,
    isGuaranteed: s.isGuaranteed ?? undefined,
  }))

  return {
    id,
    name: raw.carrierName ?? raw.name ?? undefined,
    code,
    trackingUrlTemplate: raw.trackingUrlTemplate ?? undefined,
    services: services.length > 0 ? services : undefined,
    isActive: raw.isActive ?? raw.active ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
