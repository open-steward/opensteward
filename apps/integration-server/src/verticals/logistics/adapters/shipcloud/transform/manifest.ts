/**
 * shipcloud manifest_response → canonical Manifest.
 *
 * First-party OpenAPI spec
 * (https://developers.shipcloud.io/downloads/api/oai/shipcloud_v1_oai3.json)
 * declares only:
 *   POST /manifests       — "Create a manifest"
 *   GET  /manifests/{id}  — "Getting information about a manifest"
 * There is no manifest list.
 *
 * Documented response fields (manifest + manifest_response): id, carrier,
 * carrier_reference_number ("Reference used by the carrier to identify the
 * manifest"), posting_hub_address, shipments ("array of shipment IDs that are
 * send using this manifest"), reference_number, documents[] and created_at.
 * No status and no updated_at are documented, so neither is mapped.
 */
import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface ShipcloudManifest {
  id?: string
  carrier?: string
  carrier_reference_number?: string
  posting_hub_address?: Record<string, unknown>
  shipments?: string[]
  reference_number?: string
  documents?: Array<{ identifier?: string; document_url?: string }>
  created_at?: string
  [key: string]: unknown
}

export function transformManifest(raw: ShipcloudManifest): Manifest {
  return {
    id: raw.id ?? undefined,
    carrierId: raw.carrier ?? undefined,
    manifestNumber: raw.carrier_reference_number ?? undefined,
    shipmentIds: raw.shipments && raw.shipments.length > 0 ? raw.shipments : undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
