import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface SeraManifestResponse {
  manifest_id: string
  carrier: string | null
  ship_date: string | null
  number_of_items_in_manifest: number | null
  labels: Array<{ href: string }> | null
  [key: string]: unknown
}

export function transformManifest(raw: SeraManifestResponse): Manifest {
  return {
    id: raw.manifest_id,
    carrierId: raw.carrier ?? undefined,
    status: 'SUBMITTED',
    labelCount: raw.number_of_items_in_manifest ?? undefined,
    submittedAt: toISODate(raw.ship_date),
    createdAt: toISODate(raw.ship_date),
    metadata: raw as Record<string, unknown>,
  }
}
