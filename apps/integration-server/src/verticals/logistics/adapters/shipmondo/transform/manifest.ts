import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── Shipmondo raw types ─────────────────────────────────────────────────────
// Manifests in Shipmondo are represented as "bulk waybills" (/waybills).
// A waybill groups shipments for a carrier pickup; closing it is equivalent
// to submitting a manifest.

export interface ShipmondoWaybill {
  id?: number | null
  reference?: string | null
  status?: string | null            // 'open' | 'closed'
  carrier_code?: string | null
  customer_number?: string | null
  created_at?: string | null
  shipment?: { id?: number | null } | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  if (!status) return 'OPEN'
  switch (status.toLowerCase()) {
    case 'open':
      return 'OPEN'
    case 'closed':
      return 'SUBMITTED'
    default:
      return 'OPEN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformManifest(raw: ShipmondoWaybill): Manifest {
  const shipmentIds =
    raw.shipment?.id != null ? [String(raw.shipment.id)] : undefined

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    carrierId: raw.carrier_code ?? undefined,
    manifestNumber: raw.reference ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds,
    submittedAt: raw.status?.toLowerCase() === 'closed' ? toISODate(raw.created_at) : undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
