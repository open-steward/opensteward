/**
 * Easyship manifest → canonical Manifest.
 *
 * Easyship supports end-of-day manifests (pickup summaries) that bundle
 * shipments for a specific courier. Created via `POST /manifests` and
 * retrieved via `GET /manifests/{id}`.
 *
 * Docs: https://developers.easyship.com/reference/manifests
 */

import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface EasyshipManifest {
  id?: string
  courier?: string | null
  status?: string | null
  shipment_ids?: string[]
  label_count?: number | null
  submitted_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapManifestStatus(status: string | null | undefined): ManifestStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'PENDING':
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

export function transformManifest(raw: EasyshipManifest): Manifest {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.courier ?? undefined,
    manifestNumber: raw.id ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: raw.shipment_ids ?? undefined,
    labelCount: raw.label_count ?? undefined,
    submittedAt: toISODate(raw.submitted_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
