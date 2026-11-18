/**
 * Starshipit manifest → canonical Manifest.
 *
 * Starshipit manifests ("end-of-day" documents) are created to close off a
 * day's shipments with a carrier. The API endpoint is POST /api/manifests.
 *
 * Starshipit manifest response fields:
 *   manifests — array of individual carrier manifests
 *   Each manifest: { carrier_name, carrier_code, order_ids, created_date, ... }
 *
 * Note: Starshipit does not expose a GET /api/manifests endpoint for listing
 * existing manifests; manifests are created and returned in a single POST.
 */

import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface StarshipitManifestEntry {
  manifest_id?: string | number | null
  carrier_name?: string | null
  carrier_code?: string | null
  order_ids?: (string | number)[] | null
  label_count?: number | null
  pdf?: string | null
  url?: string | null
  created_date?: string | null
  [key: string]: unknown
}

export interface StarshipitManifestResponse {
  success?: boolean
  manifests?: StarshipitManifestEntry[] | null
  manifest?: StarshipitManifestEntry | null
  errors?: unknown[]
  [key: string]: unknown
}

export function transformManifest(
  raw: StarshipitManifestEntry,
  index = 0,
): Manifest {
  return {
    id: raw.manifest_id != null
      ? String(raw.manifest_id)
      : String(index),
    carrierId: raw.carrier_code ?? raw.carrier_name ?? undefined,
    shipmentIds: (raw.order_ids ?? []).length > 0
      ? (raw.order_ids as (string | number)[]).map(String)
      : undefined,
    labelCount: raw.label_count ?? undefined,
    status: 'SUBMITTED',
    submittedAt: toISODate(raw.created_date),
    createdAt: toISODate(raw.created_date),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Expand a manifest response (which may contain multiple per-carrier entries)
 * into a flat array of canonical Manifest objects.
 */
export function transformManifests(raw: StarshipitManifestResponse): Manifest[] {
  if (raw.manifests && raw.manifests.length > 0) {
    return raw.manifests.map((m, i) => transformManifest(m, i))
  }
  if (raw.manifest) {
    return [transformManifest(raw.manifest, 0)]
  }
  return []
}
