/**
 * NimbusPost — manifest transform
 *
 * POST /shipments/manifest — create a manifest from a list of AWB numbers.
 * The API has no list/get manifest endpoint; manifests are created on demand.
 *
 * Confirmed endpoint:
 * https://github.com/tech-nimbuspost/nimbuspost-api/blob/main/src/Module/V2/ShipmentModule.php
 * Postman docs: https://documenter.getpostman.com/view/9692837/TW6wHnoz#31f3e7ea-66ce-4244-a40b-d15b191f4969
 */
import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface NimbusPostManifestRaw {
  id?: string | number | null
  manifest_id?: string | number | null
  manifest_number?: string | null
  awbs?: string[] | null
  shipment_ids?: string[] | null
  label_count?: number | null
  pdf_url?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformManifest(raw: NimbusPostManifestRaw): Manifest {
  const id = raw.id ?? raw.manifest_id
  const shipmentIds = raw.shipment_ids ?? raw.awbs ?? []

  return {
    id: id != null ? String(id) : undefined,
    carrierId: 'nimbuspost',
    manifestNumber: raw.manifest_number ?? (id != null ? String(id) : undefined),
    status: 'SUBMITTED',
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: typeof raw.label_count === 'number' ? raw.label_count : shipmentIds.length || undefined,
    submittedAt: toISODate(raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
