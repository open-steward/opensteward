import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface ShipEngineCarrierService {
  carrier_id: string
  carrier_code: string
  service_code: string
  name: string
  domestic?: boolean | null
  international?: boolean | null
  is_multi_package_supported?: boolean | null
  [key: string]: unknown
}

export interface ShipEngineCarrier {
  carrier_id: string
  carrier_code: string
  account_number?: string | null
  requires_funded_amount?: boolean | null
  balance?: number | null
  nickname?: string | null
  friendly_name?: string | null
  primary?: boolean | null
  has_multi_package_supporting_services?: boolean | null
  supports_label_messages?: boolean | null
  services?: ShipEngineCarrierService[]
  packages?: unknown[]
  options?: unknown[]
  created_at?: string | null
  modified_at?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: ShipEngineCarrier): Carrier {
  const services: CarrierService[] = (raw.services ?? []).map((svc) => ({
    code: svc.service_code,
    name: svc.name ?? undefined,
  }))

  return {
    id: raw.carrier_id,
    name: raw.friendly_name ?? raw.nickname ?? raw.carrier_code ?? undefined,
    code: raw.carrier_code ?? undefined,
    services: services.length > 0 ? services : undefined,
    isActive: true,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.modified_at),
    metadata: raw as Record<string, unknown>,
  }
}
