import type { Manifest } from '../../../schema/manifest'

/**
 * ShipMozo manifest shape returned by GET /generate-manifest?awb_numbers=...
 * The endpoint accepts up to 25 comma-separated AWB numbers and returns a manifest record.
 */
export interface ShipMozoManifest {
  manifest_id?: string | number | null
  carrier?: string | null
  awb_numbers?: string[] | null
  status?: string | null
  manifest_url?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformManifest(raw: ShipMozoManifest): Manifest {
  return {
    id: raw.manifest_id != null ? String(raw.manifest_id) : undefined,
    carrierId: raw.carrier ?? 'shipmozo',
    shipmentIds: raw.awb_numbers ?? undefined,
    labelCount: raw.awb_numbers ? raw.awb_numbers.length : undefined,
    status: 'SUBMITTED',
    submittedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
