import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { PostDkShipment } from './shipment'

// ─── Transform ──────────────────────────────────────────────────────────────
// PostNord DK does not expose a dedicated label endpoint.
// Labels are returned inline with the booking (shipment) response via the
// `label_url` field.  This transform derives a Label from a PostDkShipment.

export function transformLabel(raw: PostDkShipment): Label | undefined {
  if (!raw.label_url) return undefined

  return {
    id: raw.shipment_id,
    shipmentId: raw.shipment_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'post-dk',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
