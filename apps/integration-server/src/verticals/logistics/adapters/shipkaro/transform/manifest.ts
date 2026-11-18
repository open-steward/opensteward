import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * ShipKaro manifest response.
 *
 * ShipKaro supports manifest (pickup) generation via POST /manifests.
 * A manifest groups shipments for a single carrier pickup request.
 */
export interface ShipKaroManifest {
  id?: number | string | null
  manifest_id?: string | null
  carrier_id?: number | string | null
  carrier_name?: string | null
  pickup_address_id?: number | string | null
  status?: string | null
  shipment_ids?: Array<number | string> | null
  shipment_count?: number | null
  generated_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

const STATUS_MAP: Record<string, ManifestStatus> = {
  OPEN: 'OPEN',
  PENDING: 'OPEN',
  CLOSED: 'CLOSED',
  SUBMITTED: 'SUBMITTED',
  ACCEPTED: 'ACCEPTED',
  GENERATED: 'SUBMITTED',
}

function mapStatus(status: string | null | undefined): ManifestStatus | undefined {
  if (!status) return undefined
  return STATUS_MAP[status.toUpperCase()] ?? undefined
}

export function transformManifest(raw: ShipKaroManifest): Manifest {
  const id = raw.manifest_id ?? (raw.id != null ? String(raw.id) : undefined)
  const shipmentIds =
    raw.shipment_ids != null
      ? raw.shipment_ids.map(String).filter(Boolean)
      : undefined

  return {
    id,
    carrierId: raw.carrier_name ?? (raw.carrier_id != null ? String(raw.carrier_id) : 'shipkaro'),
    warehouseId: raw.pickup_address_id != null ? String(raw.pickup_address_id) : undefined,
    manifestNumber: id,
    status: mapStatus(raw.status),
    shipmentIds: shipmentIds && shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: raw.shipment_count ?? undefined,
    submittedAt: toISODate(raw.generated_at ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
