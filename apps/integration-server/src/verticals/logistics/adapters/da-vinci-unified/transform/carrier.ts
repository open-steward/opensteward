import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface DaVinciCarrierService {
  ServiceCode: string
  ServiceName?: string | null
  TransitDaysMin?: number | null
  TransitDaysMax?: number | null
  IsGuaranteed?: boolean | null
  [key: string]: unknown
}

export interface DaVinciCarrier {
  CarrierId?: string | number | null
  CarrierCode?: string | null
  CarrierName?: string | null
  TrackingUrlTemplate?: string | null
  IsActive?: boolean | null
  Services?: DaVinciCarrierService[]
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: DaVinciCarrier): Carrier {
  const services = (raw.Services ?? []).map((svc) => ({
    code: svc.ServiceCode,
    name: svc.ServiceName ?? undefined,
    transitDaysMin: svc.TransitDaysMin ?? undefined,
    transitDaysMax: svc.TransitDaysMax ?? undefined,
    isGuaranteed: svc.IsGuaranteed ?? undefined,
  }))

  return {
    id: raw.CarrierId != null ? String(raw.CarrierId) : (raw.CarrierCode ?? undefined),
    name: raw.CarrierName ?? undefined,
    code: raw.CarrierCode ?? undefined,
    trackingUrlTemplate: raw.TrackingUrlTemplate ?? undefined,
    isActive: raw.IsActive ?? undefined,
    services: services.length > 0 ? services : undefined,
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
