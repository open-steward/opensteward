import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── Purolator raw types ────────────────────────────────────────────────────

export interface PurolatorManifestBatchDetail {
  DocumentType?: string | null
  Description?: string | null
  DocumentStatus?: string | null
  URL?: string | null
  [key: string]: unknown
}

export interface PurolatorManifestBatch {
  ShipmentManifestDate?: string | null
  ManifestCloseDateTime?: string | null
  ManifestBatchDetails?: { ManifestBatchDetail?: PurolatorManifestBatchDetail[] } | null
  [key: string]: unknown
}

export interface PurolatorGetShipmentManifestDocumentResponse {
  ManifestBatches?: { ManifestBatch?: PurolatorManifestBatch[] } | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapManifestStatus(raw: PurolatorManifestBatch): ManifestStatus {
  const details = raw.ManifestBatchDetails?.ManifestBatchDetail ?? []
  const primary = details[0]
  const statusStr = primary?.DocumentStatus?.toUpperCase()
  switch (statusStr) {
    case 'CREATED':   return 'OPEN'
    case 'CLOSED':    return 'CLOSED'
    case 'SUBMITTED': return 'SUBMITTED'
    case 'ACCEPTED':  return 'ACCEPTED'
    default:          return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformManifest(raw: PurolatorManifestBatch): Manifest {
  const submittedAt = toISODate(raw.ManifestCloseDateTime)
  const manifestDate = raw.ShipmentManifestDate ?? undefined

  return {
    carrierId: 'purolator',
    manifestNumber: manifestDate,
    status: mapManifestStatus(raw),
    submittedAt,
    createdAt: toISODate(raw.ShipmentManifestDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformManifests(
  raw: PurolatorGetShipmentManifestDocumentResponse,
): Manifest[] {
  const batches = raw.ManifestBatches?.ManifestBatch ?? []
  return batches.map(transformManifest)
}
