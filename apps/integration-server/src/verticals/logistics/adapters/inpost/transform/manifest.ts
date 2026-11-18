/**
 * ShipX DispatchOrder → canonical Manifest.
 *
 * "DispatchOrders allow ordering courier to collect shipments from the
 * client." Documented attributes: `id`, `status`, `created_at`, `address`,
 * `shipments` (each with `href`, `id`, `tracking_number`), `comment(s)`; the
 * details example adds `external_id` ("the order number is in the
 * "external_id" parameter") and `updated_at`
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153482/).
 * Statuses: new, sent, accepted, done, rejected, canceled
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153497/).
 */
import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'
import { INPOST_CARRIER_ID } from './carrier'

export interface InPostDispatchOrderShipment {
  href?: string
  id: number | string
  tracking_number?: string
}

export interface InPostDispatchOrderResponse {
  href?: string
  id: number | string
  status?: string
  external_id?: number | string | null
  shipments?: InPostDispatchOrderShipment[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, ManifestStatus> = {
  new: 'OPEN',
  sent: 'SUBMITTED',
  accepted: 'ACCEPTED',
  done: 'CLOSED',
}

function mapStatus(raw: string | undefined): ManifestStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw] ?? 'unknown'
}

export function transformManifest(raw: InPostDispatchOrderResponse): Manifest {
  const shipmentIds = (raw.shipments ?? []).map((s) => String(s.id))
  return {
    id: String(raw.id),
    carrierId: INPOST_CARRIER_ID,
    manifestNumber:
      raw.external_id === null || raw.external_id === undefined
        ? undefined
        : String(raw.external_id),
    status: mapStatus(raw.status),
    shipmentIds: raw.shipments ? shipmentIds : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
