import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface ShipEngineManifest {
  manifest_id: string
  form_id?: string | null
  created_at?: string | null
  ship_date?: string | null
  shipments?: number | null
  label_ids?: string[]
  warehouse_id?: string | null
  submission_id?: string | null
  carrier_id?: string | null
  manifest_download?: {
    href?: string | null
  } | null
  [key: string]: unknown
}

function mapManifestStatus(_raw: ShipEngineManifest): ManifestStatus {
  // ShipEngine manifests are submitted on creation; treat all as SUBMITTED
  return 'SUBMITTED'
}

export function transformManifest(raw: ShipEngineManifest): Manifest {
  return {
    id: raw.manifest_id,
    carrierId: raw.carrier_id ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    manifestNumber: raw.form_id ?? raw.submission_id ?? undefined,
    status: mapManifestStatus(raw),
    labelCount: typeof raw.shipments === 'number' ? raw.shipments : undefined,
    submittedAt: toISODate(raw.ship_date),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
