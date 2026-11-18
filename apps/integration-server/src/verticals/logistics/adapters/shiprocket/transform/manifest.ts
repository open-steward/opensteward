import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// Shiprocket POST manifests/generate
// Request: { shipment_id: number[] }
// Response: { manifest_url: string | null, ... }

export interface ShiprocketManifestResponse {
  manifest_url: string | null
  is_return: boolean | null
  [key: string]: unknown
}

export function transformManifest(raw: ShiprocketManifestResponse, shipmentIds?: string[]): Manifest {
  return {
    status: 'SUBMITTED',
    shipmentIds: shipmentIds,
    labelCount: shipmentIds?.length,
    submittedAt: toISODate((raw as Record<string, unknown>).created_at) ?? new Date(),
    createdAt: toISODate((raw as Record<string, unknown>).created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
