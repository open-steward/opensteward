import type { Label } from '../../../schema/label'
import type { DpdLocalUkShipment } from './shipment'

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Derive a Label from a DPD Local UK shipment response.
 * DPD Local UK returns the label as a URL in the label_url field of the
 * shipment resource (returned on POST /shipments and GET /shipments/{id}).
 */
export function transformLabel(raw: DpdLocalUkShipment): Label {
  return {
    id: raw.id,
    shipmentId: raw.id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'dpd-local-uk',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
