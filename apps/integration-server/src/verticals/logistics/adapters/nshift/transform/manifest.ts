import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── nShift raw types ────────────────────────────────────────────────────────

export interface NShiftManifest {
  id?: string | null
  manifestNumber?: string | null
  status?: string | null
  carrierId?: string | null
  warehouseId?: string | null
  shipmentIds?: string[] | null
  labelCount?: number | null
  submittedAt?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  if (!status) return 'OPEN'
  const v = status.toUpperCase()
  if (v === 'OPEN' || v === 'PENDING' || v === 'DRAFT') return 'OPEN'
  if (v === 'CLOSED' || v === 'FINALIZED') return 'CLOSED'
  if (v === 'SUBMITTED' || v === 'SENT') return 'SUBMITTED'
  if (v === 'ACCEPTED' || v === 'CONFIRMED') return 'ACCEPTED'
  return 'OPEN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformManifest(raw: NShiftManifest): Manifest {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrierId ?? 'nshift',
    warehouseId: raw.warehouseId ?? undefined,
    manifestNumber: raw.manifestNumber ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: raw.shipmentIds ?? undefined,
    labelCount: raw.labelCount ?? undefined,
    submittedAt: toISODate(raw.submittedAt),
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
