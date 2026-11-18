import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { NaqelShipment } from './shipment'

// ─── Transform ─────────────────────────────────────────────────────────────
//
// Naqel does not expose a dedicated /labels endpoint in the v2 REST API.
// A label is derived from the shipment response: the `label_url` field on a
// NaqelShipment directly carries the hosted PDF sticker URL, and the waybill
// number doubles as the label identifier.

export function transformLabel(raw: NaqelShipment): Label {
  return {
    id: raw.waybillNumber,
    shipmentId: raw.waybillNumber,
    trackingNumber: raw.waybillNumber ?? undefined,
    carrierId: 'naqel',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
