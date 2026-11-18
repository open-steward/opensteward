import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── DHL Africa raw types ────────────────────────────────────────────────────
// Source: POST /shipments  →  shipment creation response includes labelUrl
//         GET  /shipments/{id}  →  shipment detail includes labelUrl
//
// DHL Africa does not expose a dedicated /labels endpoint; label data is
// returned as part of the shipment resource.  A Label is therefore derived
// directly from the shipment response.

export interface DhlAfricaLabelSource {
  /** Shipment identifier (used as label ID) */
  id: string
  /** Waybill / tracking number */
  trackingNumber?: string | null
  /** DHL-generated service / product code */
  serviceType?: string | null
  /** Hosted URL for the shipping label PDF */
  labelUrl?: string | null
  /** Base64-encoded label content (alternative to labelUrl) */
  labelData?: string | null
  /** Creation timestamp */
  createdAt?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: DhlAfricaLabelSource): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.id ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'dhl-africa',
    serviceCode: raw.serviceType ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: raw.labelData ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
