import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── Endicia raw types ─────────────────────────────────────────────────────

export interface EndiciaManifest {
  manifest_id: string | null
  carrier: string | null
  ship_date: string | null
  number_of_items_in_manifest: number | null
  labels?: Array<{ href: string }> | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformManifest(raw: EndiciaManifest): Manifest {
  return {
    id: raw.manifest_id ?? undefined,
    carrierId: raw.carrier ?? 'endicia',
    manifestNumber: raw.manifest_id ?? undefined,
    status: 'SUBMITTED',
    labelCount: raw.number_of_items_in_manifest ?? undefined,
    submittedAt: toISODate(raw.ship_date),
    createdAt: toISODate(raw.ship_date),
    metadata: raw as Record<string, unknown>,
  }
}
