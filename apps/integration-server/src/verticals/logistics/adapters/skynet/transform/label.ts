/**
 * SkyNet Worldwide Express — derived Label transform.
 *
 * SkyNet does not expose a standalone /labels endpoint. The label PDF URL
 * is embedded in the shipment creation response (`label_url` field), along
 * with the waybill number (tracking number) and service code. We derive a
 * canonical Label by projecting those fields from the SkynetShipment shape.
 *
 * Docs reference: https://www.skynetwwe.com/developer (private; label URL
 * confirmed present in createShipment response via existing adapter usage).
 */
import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { SkynetShipment } from './shipment'

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformLabel(raw: SkynetShipment): Label {
  return {
    id: raw.waybillNumber ?? undefined,
    shipmentId: raw.waybillNumber ?? undefined,
    trackingNumber: raw.waybillNumber ?? undefined,
    carrierId: 'skynet',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
