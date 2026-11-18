import type { Manifest } from '../../../schema/manifest'

/**
 * Karrio `Manifest` (https://docs.karrio.io/reference/openapi, schema Manifest):
 * id "A unique manifest identifier", carrier_name, carrier_id "The manifest
 * carrier configured name", shipment_identifiers ("shipment_identifier is often
 * a tracking_number or shipment_id returned when you purchase a label"),
 * manifest_url "The Manifest file URL", reference. It documents no status and
 * no created_at.
 */
export interface KarrioManifest {
  id: string
  carrier_id?: string | null
  carrier_name?: string | null
  reference?: string | null
  manifest_url?: string | null
  meta?: Record<string, unknown> | null
  shipment_identifiers?: string[]
  [key: string]: unknown
}

export function transformManifest(raw: KarrioManifest): Manifest {
  return {
    id: raw.id,
    carrierId: raw.carrier_id ?? undefined,
    manifestNumber: raw.reference ?? undefined,
    // shipment_identifiers are carrier tracking numbers or carrier shipment ids,
    // not Karrio Shipment ids, so they are not canonical shipmentIds.
    metadata: raw as Record<string, unknown>,
  }
}
