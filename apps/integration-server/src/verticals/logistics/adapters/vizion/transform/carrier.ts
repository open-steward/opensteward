import type { Carrier } from '../../../schema/carrier'

/**
 * Vizion carriers endpoint: GET /carriers
 * Returns the ocean carriers that Vizion supports for container tracking.
 * Documented fields per https://docs.vizionapi.com/reference/carrier_list:
 *   carrier_code  — Vizion's 4-letter carrier code
 *   scac          — SCAC code (deprecated by Vizion)
 *   name          — Carrier display name
 */
export interface VizionCarrier {
  carrier_code?: string | null
  scac?: string | null
  name?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: VizionCarrier): Carrier {
  const code = raw.carrier_code ?? raw.scac ?? undefined
  return {
    id: code,
    name: raw.name ?? undefined,
    code,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
