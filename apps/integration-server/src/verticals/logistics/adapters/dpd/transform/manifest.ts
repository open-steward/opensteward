import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface DPDManifestResponse {
  manifestId: string | null
  manifestReference: string | null
  manifestDate: string | null
  status: string | null
  totalShipments: number | null
  shipmentIds: string[] | null
  carrierId: string | null
  [key: string]: unknown
}

function mapManifestStatus(status: string | null): ManifestStatus {
  switch (status) {
    case 'OPEN':       return 'OPEN'
    case 'CLOSED':     return 'CLOSED'
    case 'SUBMITTED':  return 'SUBMITTED'
    case 'ACCEPTED':   return 'ACCEPTED'
    default:           return 'OPEN'
  }
}

export function transformManifest(raw: DPDManifestResponse): Manifest {
  return {
    id: raw.manifestId ?? undefined,
    carrierId: raw.carrierId ?? 'dpd',
    manifestNumber: raw.manifestReference ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: raw.shipmentIds ?? undefined,
    labelCount: raw.totalShipments ?? undefined,
    submittedAt: toISODate(raw.manifestDate),
    createdAt: toISODate(raw.manifestDate),
    metadata: raw as Record<string, unknown>,
  }
}
