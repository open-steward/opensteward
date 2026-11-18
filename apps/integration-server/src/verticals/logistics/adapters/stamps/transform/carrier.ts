import type { Carrier } from '../../../schema/carrier'

export interface SeraCarrierService {
  service_type: string
  service_name: string | null
  [key: string]: unknown
}

export interface SeraCarrierOption {
  carrier: string
  services: SeraCarrierService[]
  [key: string]: unknown
}

export interface SeraCarrierServicesResponse {
  shipping_options: SeraCarrierOption[]
  [key: string]: unknown
}

export function transformCarrier(raw: SeraCarrierOption): Carrier {
  return {
    id: raw.carrier,
    name: raw.carrier,
    code: raw.carrier,
    isActive: true,
    services: (raw.services ?? []).map((svc) => ({
      code: svc.service_type,
      name: svc.service_name ?? svc.service_type,
    })),
    metadata: raw as Record<string, unknown>,
  }
}
