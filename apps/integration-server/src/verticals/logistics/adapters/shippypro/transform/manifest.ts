import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface ShippyProManifest {
  ManifestId?: string | number | null
  CarrierName?: string | null
  CarrierCode?: string | null
  Status?: string | null
  Orders?: Array<string | number> | null
  ShipmentIds?: Array<string | number> | null
  LabelCount?: number | null
  SubmittedAt?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ManifestStatus | undefined {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN':
      return 'OPEN'
    case 'CLOSED':
      return 'CLOSED'
    case 'SUBMITTED':
      return 'SUBMITTED'
    case 'ACCEPTED':
      return 'ACCEPTED'
    default:
      return undefined
  }
}

export function transformManifest(raw: ShippyProManifest): Manifest {
  const id = raw.ManifestId != null ? String(raw.ManifestId) : undefined
  const rawShipmentIds = (raw.ShipmentIds ?? raw.Orders ?? []).map(String)

  return {
    id,
    carrierId: raw.CarrierName ?? raw.CarrierCode ?? 'shippypro',
    manifestNumber: id,
    status: mapStatus(raw.Status),
    shipmentIds: rawShipmentIds.length > 0 ? rawShipmentIds : undefined,
    labelCount: raw.LabelCount ?? undefined,
    submittedAt: toISODate(raw.SubmittedAt),
    createdAt: toISODate(raw.CreatedAt),
    updatedAt: toISODate(raw.UpdatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
