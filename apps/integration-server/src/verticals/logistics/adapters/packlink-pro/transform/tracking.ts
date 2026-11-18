import type { TrackingEvent } from '../../../schema/trackingevent'

// ─── Packlink PRO raw types ─────────────────────────────────────────────────────
// Source: GET v1/shipments/{reference}/track. Packlink's own integration core
// (packlink-dev/ecommerce_module_core, src/BusinessLogic/Http/DTO/Tracking.php)
// reads `history` and, per entry, only timestamp, description and city.
// Example body: that repo's tests/BusinessLogic/Common/ApiResponses/tracking.json.

export interface PacklinkProTrackingEntry {
  timestamp?: number | null
  description?: string | null
  city?: string | null
  [key: string]: unknown
}

export interface PacklinkProTrackingResponse {
  history?: PacklinkProTrackingEntry[] | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * One event per `history` entry. The core documents `timestamp` only as an
 * int with no unit, so no occurredAt is derived from it; `description` is
 * free text, so no status is derived either. Both stay in metadata.
 */
export function transformTracking(
  raw: PacklinkProTrackingResponse,
  reference: string,
): TrackingEvent[] {
  const history = Array.isArray(raw.history) ? raw.history : []
  // The id is keyed on the entry's own timestamp, not its position: the
  // first-party fixture lists history newest first, so a new event arriving
  // would shift every position. The ordinal only separates entries that share
  // a timestamp.
  const seen = new Map<string, number>()
  return history.map((entry) => {
    const ts = String(entry.timestamp ?? '')
    const n = seen.get(ts) ?? 0
    seen.set(ts, n + 1)
    return {
      id: `${reference}:${ts}:${n}`,
      shipmentId: reference,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      location: typeof entry.city === 'string' && entry.city ? { city: entry.city } : undefined,
      metadata: entry as Record<string, unknown>,
    }
  })
}
