import type { Carrier } from '../../../schema/carrier'

// ─── Raw ShipsGo API types ────────────────────────────────────────────────────

/**
 * A carrier record as returned by the ShipsGo v2 API.
 * Endpoint: GET /ocean/carriers
 * Docs:     https://api.shipsgo.com/docs/v2/
 */
export interface ShipsGoOceanCarrier {
  /** SCAC code of the carrier (e.g. "MSCU", "OOLU"). */
  scac?: string | null
  /** Human-readable carrier name (e.g. "MSC"). */
  name?: string | null
  /**
   * Trackability status.
   * "ACTIVE"  — carrier is trackable.
   * "PASSIVE" — carrier is not currently trackable.
   */
  status?: 'ACTIVE' | 'PASSIVE' | null
  [key: string]: unknown
}

/**
 * List response wrapper returned by GET /ocean/carriers.
 */
export interface ShipsGoCarrierListResponse {
  message?: string | null
  carriers?: ShipsGoOceanCarrier[] | null
  meta?: {
    more?: boolean | null
    total?: number | null
  } | null
  [key: string]: unknown
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformCarrier(raw: ShipsGoOceanCarrier): Carrier {
  const code = raw.scac ?? undefined
  const name = raw.name ?? undefined

  const trackingUrlTemplate =
    code != null
      ? `https://shipsgo.com/container-tracking?scac=${code}&containerNumber={trackingNumber}`
      : undefined

  return {
    id: code,
    name,
    code,
    trackingUrlTemplate,
    isActive: raw.status === 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
