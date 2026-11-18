import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// Response from POST /v3.1/CustomCarrier/eod (end-of-day / manifest)
export interface LogiwaManifestPackage {
  masterTrackingNumber?: string | null
  shipmentOrderIdentifier?: string | null
  [key: string]: unknown
}

export interface LogiwaEodResponse {
  carrier?: string | null
  warehouseIdentifier?: string | null
  manifestNumber?: string | null
  submittedAt?: string | null
  status?: string | null
  packages?: LogiwaManifestPackage[]
  isSuccessful?: boolean
  createdAt?: string | null
  [key: string]: unknown
}

function mapManifestStatus(raw: LogiwaEodResponse): ManifestStatus {
  if (!raw.isSuccessful) return 'OPEN'
  switch (raw.status) {
    case 'Submitted':  return 'SUBMITTED'
    case 'Accepted':   return 'ACCEPTED'
    case 'Closed':     return 'CLOSED'
    default:           return 'SUBMITTED'
  }
}

export function transformManifest(raw: LogiwaEodResponse): Manifest {
  const shipmentIds =
    raw.packages && raw.packages.length > 0
      ? raw.packages
          .map((p) => p.shipmentOrderIdentifier)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : undefined

  return {
    carrierId: raw.carrier ?? undefined,
    warehouseId:
      raw.warehouseIdentifier != null ? String(raw.warehouseIdentifier) : undefined,
    manifestNumber: raw.manifestNumber ?? undefined,
    status: mapManifestStatus(raw),
    shipmentIds: shipmentIds && shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: raw.packages?.length ?? undefined,
    submittedAt: toISODate(raw.submittedAt),
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
