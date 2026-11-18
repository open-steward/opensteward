import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * Response from GET /manifests
 * https://developer.dhl.com/api-reference/parcel-de-shipping-post-parcel-germany-v2
 */
export interface DhlParcelDeGetManifestData {
  b64?: string | string[] | null
  zpl2?: string | null
  url?: string | null
  fileFormat?: string | null
  printFormat?: string | null
  [key: string]: unknown
}

export interface DhlParcelDeSingleManifestResponse {
  status?: Record<string, unknown> | null
  manifestDate?: string | null
  manifest?: DhlParcelDeGetManifestData | null
  [key: string]: unknown
}

/**
 * Response item from POST /manifests (marks shipments as ready for shipping).
 * Returns an array of short response items per shipment.
 */
export interface DhlParcelDeManifestShortItem {
  shipmentNo?: string | null
  sstatus?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface DhlParcelDeMultipleManifestResponse {
  status?: Record<string, unknown> | null
  items?: DhlParcelDeManifestShortItem[]
  [key: string]: unknown
}

function mapManifestStatus(raw: DhlParcelDeSingleManifestResponse): ManifestStatus {
  // GET /manifests always returns a finalised daily closing — treat as SUBMITTED
  if (raw.manifest) return 'SUBMITTED'
  return 'OPEN'
}

export function transformManifest(raw: DhlParcelDeSingleManifestResponse): Manifest {
  const doc = raw.manifest ?? null
  const manifestDate = raw.manifestDate ?? undefined

  // Prefer URL; fall back to first b64 chunk URL if present
  const docUrl = doc?.url ?? undefined

  return {
    id: manifestDate,          // DHL does not issue a manifest ID; date is the natural key
    carrierId: 'dhl-parcel-de',
    manifestNumber: manifestDate,
    status: mapManifestStatus(raw),
    submittedAt: toISODate(manifestDate),
    createdAt: toISODate(manifestDate),
    metadata: { ...raw, labelUrl: docUrl } as Record<string, unknown>,
  }
}
