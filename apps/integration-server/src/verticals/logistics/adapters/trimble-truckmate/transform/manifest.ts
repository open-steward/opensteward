import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface TrimbleTruckmateManifestResponse {
  id?: string
  manifestId?: string
  carrierId?: string
  carrierCode?: string
  warehouseId?: string
  siteId?: string
  manifestNumber?: string
  manifestCode?: string
  status?: string
  manifestStatus?: string
  shipmentIds?: string[]
  tripIds?: string[]
  labelCount?: number
  submittedAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, ManifestStatus> = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  SUBMITTED: 'SUBMITTED',
  ACCEPTED: 'ACCEPTED',
}

function mapStatus(raw: string | undefined): ManifestStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toUpperCase()] ?? undefined
}

export function transformManifest(raw: TrimbleTruckmateManifestResponse): Manifest {
  const id = raw.manifestId ?? raw.id ?? undefined
  const shipmentIds = raw.shipmentIds ?? raw.tripIds ?? undefined

  return {
    id,
    carrierId: raw.carrierId ?? raw.carrierCode ?? 'trimble-truckmate',
    warehouseId: raw.warehouseId ?? raw.siteId ?? undefined,
    manifestNumber: raw.manifestNumber ?? raw.manifestCode ?? undefined,
    status: mapStatus(raw.manifestStatus ?? raw.status),
    shipmentIds: shipmentIds && shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: raw.labelCount ?? undefined,
    submittedAt: toISODate(raw.submittedAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
