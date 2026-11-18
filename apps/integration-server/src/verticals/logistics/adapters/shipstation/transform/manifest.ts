/**
 * ShipStation – Manifest transform.
 *
 * NOT CALLED BY ANY METHOD TODAY. ShipStation API v1, which this adapter
 * speaks, has no manifest operation; the `POST /shipments/createmanifest` this
 * file originally documented appears in no ShipStation spec, and the doc URL it
 * cited (www.shipstation.com/docs/api/shipments/create-manifest/) is a 404.
 * `createManifest` was removed on that basis — see the Manifests block in
 * ../index.ts for the V1 spec URL and the 2026-09-13 probe.
 *
 * Kept because it is a correct mapping onto the canonical Manifest schema
 * (pinned by tests/.../shipstation/transform/manifest.test.ts) and is the
 * landing spot for a `POST /v2/manifests` response once the adapter grows a
 * v2 client. The raw field set below is a v1/v2 blend rather than a captured
 * response (camelCase `manifestId`/`shipmentIds` beside v2-shaped `labelIds`);
 * re-derive it from v2's `create_manifest_response_body` at that point.
 */

import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface SSManifest {
  manifestId?: number | null
  form?: string | null          // PDF URL of the manifest
  createDate?: string | null
  shipDate?: string | null
  carrierId?: number | null
  carrierCode?: string | null
  warehouseId?: number | null
  shipmentIds?: number[] | null
  labelIds?: string[] | null
  [key: string]: unknown
}

function mapStatus(raw: SSManifest): ManifestStatus {
  // ShipStation manifests are created as SUBMITTED immediately
  return raw.form ? 'SUBMITTED' : 'OPEN'
}

export function transformManifest(raw: SSManifest): Manifest {
  return {
    id: raw.manifestId != null ? String(raw.manifestId) : undefined,
    carrierId: raw.carrierCode ?? (raw.carrierId != null ? String(raw.carrierId) : undefined),
    warehouseId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    status: mapStatus(raw),
    shipmentIds: raw.shipmentIds?.map(String) ?? raw.labelIds ?? undefined,
    submittedAt: toISODate(raw.createDate),
    createdAt: toISODate(raw.createDate),
    metadata: raw as Record<string, unknown>,
  }
}
