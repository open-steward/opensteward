import type { Carrier } from '../../../schema/carrier'

// ─── Raw API types ────────────────────────────────────────────────────────────

/**
 * A single sealine entry from GET /sealines
 * (container-tracking/api/v2/sealines)
 */
export interface SinalySealine {
  /** Full shipping-line name, e.g. "Maersk" */
  name?: string | null
  /** Whether this sealine is currently active/supported */
  active?: boolean | null
  /** Tracking type flags: CT = container, BL = bill-of-lading, BK = booking */
  activeTypes?: {
    CT?: boolean | null
    BL?: boolean | null
    BK?: boolean | null
  } | null
  /** True when the sealine feed is temporarily under maintenance */
  maintenance?: boolean | null
  /** Array of SCAC codes identifying this sealine (e.g. ["MAEU"]) */
  scacCodes?: string[] | null
  /** Document / container-number prefixes (e.g. ["MSKU", "MRKU"]) */
  prefixes?: string[] | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * Transform a single sealine entry from GET /sealines into a canonical Carrier.
 *
 * The primary SCAC code (first entry in scacCodes) is used as the carrier id.
 */
export function transformCarrier(raw: SinalySealine): Carrier {
  const primaryScac = raw.scacCodes?.[0] ?? undefined

  return {
    id: primaryScac ?? raw.name ?? undefined,
    name: raw.name ?? undefined,
    code: primaryScac,
    isActive: raw.active === true && raw.maintenance !== true,
    metadata: raw as Record<string, unknown>,
  }
}
