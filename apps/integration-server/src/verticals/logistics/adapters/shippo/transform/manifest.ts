import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface ShippoManifest {
  object_id: string
  object_created: string
  object_updated?: string
  status?: string
  carrier_account?: string
  shipment_date?: string
  address_from?: Record<string, unknown>
  transactions?: string[]
  documents?: string[]
  metadata?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, ManifestStatus> = {
  WAITING: 'OPEN',
  QUEUED: 'OPEN',
  SUCCESS: 'SUBMITTED',
  ERROR: 'OPEN',
}

function mapStatus(raw: string | undefined): ManifestStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toUpperCase()] ?? undefined
}

export function transformManifest(raw: ShippoManifest): Manifest {
  const shipmentIds = raw.transactions ?? undefined

  return {
    id: raw.object_id,
    carrierId: raw.carrier_account ?? 'shippo',
    manifestNumber: raw.object_id,
    status: mapStatus(raw.status),
    shipmentIds: shipmentIds && shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: shipmentIds ? shipmentIds.length : undefined,
    submittedAt: toISODate(raw.shipment_date),
    createdAt: toISODate(raw.object_created),
    updatedAt: toISODate(raw.object_updated),
    metadata: raw as Record<string, unknown>,
  }
}
