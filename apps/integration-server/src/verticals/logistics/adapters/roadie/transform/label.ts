import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import { ROADIE_API_BASE } from '../constants'

// Roadie does not expose a dedicated label resource endpoint.
// Labels are derived from shipment data: GET /v1/shipments/{id} provides
// the metadata, and GET /v1/shipments/{id}/label returns raw PNG/PDF bytes.
// We synthesise a canonical Label from the shipment response.
export interface RoadieLabelShipment {
  id: string | number
  state?: string | null
  tracking_number?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformLabel(raw: RoadieLabelShipment): Label {
  const id = String(raw.id)
  return {
    id,
    shipmentId: id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'roadie',
    serviceCode: 'roadie',
    format: 'PNG',
    status: 'CREATED',
    // The label bytes are served at this endpoint; callers can fetch it directly.
    url: `${ROADIE_API_BASE}shipments/${id}/label`,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
