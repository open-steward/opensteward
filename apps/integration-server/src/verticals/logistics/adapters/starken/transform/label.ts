import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { StarkenEnvio } from './shipment'

// ─── Derived resource ──────────────────────────────────────────────────────
//
// Starken does not expose a dedicated label endpoint.  The label URL is
// embedded inside the envio (shipment) response as `label_url`.  This
// transform derives a Label record from a StarkenEnvio object.

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: StarkenEnvio): Label {
  return {
    id: raw.envio_id,
    shipmentId: raw.envio_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'starken',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: raw.label_url ? 'CREATED' : 'UNKNOWN',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
