import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * Manifest object returned by POST /ship/manifest (Shipping API).
 */
export interface EnviaManifest {
  id?: string | null
  carrier?: string | null
  manifestNumber?: string | null
  status?: string | null
  shipments?: string[] | null
  trackingNumbers?: string[] | null
  labelUrl?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformManifest(raw: EnviaManifest): Manifest {
  const shipmentIds = (raw.shipments ?? raw.trackingNumbers ?? []).filter(
    (s): s is string => typeof s === 'string',
  )

  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier ?? undefined,
    manifestNumber: raw.manifestNumber ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: shipmentIds.length > 0 ? shipmentIds.length : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

function mapManifestStatus(status: string | null | undefined): Manifest['status'] {
  if (!status) return 'OPEN'
  const s = status.toLowerCase()
  if (s.includes('open') || s.includes('pending')) return 'OPEN'
  if (s.includes('closed')) return 'CLOSED'
  if (s.includes('submitted') || s.includes('sent')) return 'SUBMITTED'
  if (s.includes('accepted')) return 'ACCEPTED'
  return 'OPEN'
}
