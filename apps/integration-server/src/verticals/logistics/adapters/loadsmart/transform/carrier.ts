import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

/**
 * Shape returned by GET /api/v2/carrier/search?mc={mc} or ?dot={dot}
 * Confirmed from the Loadsmart OpenAPI spec (developer.loadsmart.com/api/openapi.yaml).
 */
export interface LoadsmartCarrierResponse {
  id?: string
  name?: string
  mc?: string
  dot?: string
  status?: string
  eligible?: boolean
  [key: string]: unknown
}

export function transformCarrier(raw: LoadsmartCarrierResponse): Carrier {
  return {
    id: raw.id ?? raw.mc ?? raw.dot ?? undefined,
    name: raw.name ?? undefined,
    code: raw.mc ?? raw.dot ?? undefined,
    isActive: raw.eligible ?? (raw.status === 'READY' ? true : undefined),
    createdAt: toISODate((raw as Record<string, unknown>).createdAt),
    updatedAt: toISODate((raw as Record<string, unknown>).updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
