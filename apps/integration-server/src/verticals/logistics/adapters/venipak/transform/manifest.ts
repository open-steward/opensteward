import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * Venipak manifest response — returned by ws/print_list endpoint.
 *
 * The ws/print_list endpoint accepts a manifest `code` and returns a PDF
 * blob or a JSON envelope describing the manifest. When the API returns
 * JSON metadata (rather than raw PDF bytes), the fields below are present.
 * The manifest_id maps to the `code` sent in the request.
 */
export interface VenipakManifestResponse {
  manifest_id?: string | null
  code?: string | null
  status?: string | null
  closed?: boolean | string | number | null
  pack_count?: string | number | null
  label_count?: string | number | null
  created_at?: string | null
  closed_at?: string | null
  [key: string]: unknown
}

function mapManifestStatus(
  raw: VenipakManifestResponse,
): ManifestStatus {
  const closed =
    raw.closed === true ||
    raw.closed === 1 ||
    raw.closed === '1' ||
    raw.status === 'closed'
  if (closed) return 'CLOSED'
  if (raw.status === 'submitted' || raw.status === 'accepted') return 'SUBMITTED'
  return 'OPEN'
}

export function transformManifest(
  raw: VenipakManifestResponse,
  manifestCode?: string,
): Manifest {
  const id = raw.manifest_id ?? raw.code ?? manifestCode ?? undefined
  const labelCount =
    raw.label_count != null ? Number(raw.label_count) : undefined
  const packCount =
    raw.pack_count != null ? Number(raw.pack_count) : undefined

  return {
    id,
    carrierId: 'venipak',
    manifestNumber: id,
    status: mapManifestStatus(raw),
    labelCount: !isNaN(labelCount as number) ? labelCount : packCount,
    submittedAt: toISODate(raw.closed_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
