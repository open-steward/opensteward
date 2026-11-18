import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// NZ Post ParcelLabel API v3 — POST /parcellabel/v3/labels with manifest_only: true
// Manifest-only requests use the same labels endpoint; the manifest_only flag suppresses
// label PDF generation and submits manifest data only.
// Docs: https://anypoint.mulesoft.com/exchange/portals/nz-post-group/.../parcellabel-api/

export interface NZPostManifestResponse {
  /** Unique identifier for the consignment (used as manifest id). */
  consignment_id: string
  message_id?: string
  success?: boolean
  [key: string]: unknown
}

export function transformManifest(raw: NZPostManifestResponse): Manifest {
  return {
    id: raw.consignment_id,
    carrierId: 'nzpost',
    warehouseId: undefined,
    manifestNumber: raw.consignment_id,
    status: raw.success === true ? 'SUBMITTED' : 'OPEN',
    shipmentIds: undefined,
    labelCount: undefined,
    submittedAt: raw.success === true ? toISODate(new Date().toISOString()) : undefined,
    createdAt: toISODate(new Date().toISOString()),
    updatedAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
