/**
 * ClickPost Manifest -> canonical Manifest.
 *
 * ClickPost supports a manifest/closure API that generates end-of-day manifests
 * grouping AWBs for handover to courier partners.
 * Reference: https://docs.clickpost.ai/docs/getting-started
 */
import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface ClickPostManifest {
  manifest_id?: string | null
  id?: string | null
  status?: string | null
  cp_id?: number | null
  carrier_name?: string | null
  waybills?: string[] | null
  awb_count?: number | null
  label_count?: number | null
  submitted_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(raw: string | null | undefined): ManifestStatus | undefined {
  const s = (raw ?? '').toUpperCase()
  if (s === 'OPEN') return 'OPEN'
  if (s === 'CLOSED' || s === 'GENERATED') return 'CLOSED'
  if (s === 'SUBMITTED') return 'SUBMITTED'
  if (s === 'ACCEPTED' || s === 'APPROVED') return 'ACCEPTED'
  return undefined
}

export function transformManifest(raw: ClickPostManifest): Manifest {
  const id = raw.manifest_id ?? raw.id ?? undefined
  const carrierId =
    raw.cp_id != null ? String(raw.cp_id) : (raw.carrier_name ?? 'clickpost')

  return {
    id: id ? String(id) : undefined,
    carrierId,
    manifestNumber: id ? String(id) : undefined,
    status: mapStatus(raw.status),
    shipmentIds:
      Array.isArray(raw.waybills) && raw.waybills.length > 0
        ? raw.waybills.map(String)
        : undefined,
    labelCount: raw.awb_count ?? raw.label_count ?? undefined,
    submittedAt: toISODate(raw.submitted_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
