import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

// ── Raw Truckstop carrier shapes ──────────────────────────────────────────

export interface TruckstopCarrierProfile {
  carrierProfileId?: string
  carrierId?: string
  name?: string
  dotNumber?: string
  mcNumber?: string
  isActive?: boolean
  createdDate?: string
  lastUpdatedDate?: string
  [key: string]: unknown
}

export interface TruckstopCarrierSearchResponse {
  carriers?: TruckstopCarrierProfile[]
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformCarrier(raw: TruckstopCarrierProfile): Carrier {
  return {
    id: raw.carrierProfileId ?? raw.carrierId ?? undefined,
    name: raw.name ?? undefined,
    code: raw.dotNumber ?? raw.mcNumber ?? undefined,
    trackingUrlTemplate: undefined,
    services: undefined,
    isActive: raw.isActive ?? undefined,
    createdAt: toISODate(raw.createdDate) ?? undefined,
    updatedAt: toISODate(raw.lastUpdatedDate) ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
