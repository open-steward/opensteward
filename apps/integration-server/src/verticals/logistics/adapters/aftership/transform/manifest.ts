import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// AfterShip Shipping API (Postmen v3) — GET /manifests, GET /manifests/:id, POST /manifests
// Docs: https://www.aftership.com/docs/shipping/model/resource/manifest
// Status values: creating | manifested | failed

export interface AfterShipManifestLabel {
  id: string
  manifested: boolean
}

export interface AfterShipManifestFile {
  url: string | null
  file_type: string | null
  paper_size: string | null
}

export interface AfterShipManifestFiles {
  manifest: AfterShipManifestFile | null
  label?: AfterShipManifestFile | null
  invoice?: AfterShipManifestFile | null
  customs_declaration?: AfterShipManifestFile | null
}

export interface AfterShipManifest {
  id: string
  status: string
  labels: AfterShipManifestLabel[] | null
  files: AfterShipManifestFiles | null
  shipper_account?: { id: string; slug: string | null } | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapManifestStatus(status: string): ManifestStatus {
  switch (status) {
    case 'manifested':
      return 'SUBMITTED'
    case 'creating':
      return 'OPEN'
    case 'failed':
      return 'OPEN'
    default:
      return 'OPEN'
  }
}

export function transformManifest(raw: AfterShipManifest): Manifest {
  const labelIds = (raw.labels ?? []).map((l) => l.id)

  return {
    id: raw.id,
    carrierId: raw.shipper_account?.slug ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: labelIds.length > 0 ? labelIds : undefined,
    labelCount: labelIds.length > 0 ? labelIds.length : undefined,
    submittedAt: raw.status === 'manifested' ? toISODate(raw.updated_at) : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
