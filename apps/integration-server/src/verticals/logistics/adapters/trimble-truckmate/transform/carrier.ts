import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface TrimbleTruckmateCarrierServiceRaw {
  code?: string
  serviceCode?: string
  name?: string
  serviceName?: string
  transitDaysMin?: number
  transitDaysMax?: number
  isGuaranteed?: boolean
  [key: string]: unknown
}

export interface TrimbleTruckmateCarrierResponse {
  id?: string
  carrierId?: string
  name?: string
  carrierName?: string
  code?: string
  carrierCode?: string
  scac?: string
  trackingUrlTemplate?: string
  services?: TrimbleTruckmateCarrierServiceRaw[]
  isActive?: boolean
  active?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function transformCarrierService(raw: TrimbleTruckmateCarrierServiceRaw): CarrierService {
  return {
    code: raw.serviceCode ?? raw.code ?? 'UNKNOWN',
    name: raw.serviceName ?? raw.name ?? undefined,
    transitDaysMin: raw.transitDaysMin ?? undefined,
    transitDaysMax: raw.transitDaysMax ?? undefined,
    isGuaranteed: raw.isGuaranteed ?? undefined,
  }
}

export function transformCarrier(raw: TrimbleTruckmateCarrierResponse): Carrier {
  const id = raw.carrierId ?? raw.id ?? undefined
  const code = raw.scac ?? raw.carrierCode ?? raw.code ?? undefined
  const services = (raw.services ?? []).map(transformCarrierService)

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
