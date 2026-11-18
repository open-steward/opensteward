import type { Carrier } from '../../../schema/carrier'

/**
 * Shipday carrier (driver) as returned by GET /carriers.
 */
export interface ShipdayCarrier {
  id?: number | null
  name?: string | null
  email?: string | null
  phone_number?: string | null
  isActive?: boolean | null
  [key: string]: unknown
}

export function transformCarrier(raw: ShipdayCarrier): Carrier {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    code: raw.id != null ? String(raw.id) : undefined,
    isActive: raw.isActive ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
