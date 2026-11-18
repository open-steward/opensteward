/**
 * Correo Argentino MiCorreo API — envio response → canonical Label.
 *
 * The MiCorreo API does not expose a dedicated label endpoint. The label is
 * returned as a `label_url` field within the shipment (envio) object from
 * POST /envios (shipping/import) or GET /envios/{id}. This transform extracts
 * the label details from the shipment response.
 *
 * Documented in: Correo Argentino API MiCorreo documentation (apiMiCorreo.pdf)
 * Derived from: CorreoArgentinoEnvio (shipment response)
 */
import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { CorreoArgentinoEnvio } from './shipment'

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformLabel(raw: CorreoArgentinoEnvio): Label {
  return {
    id: raw.envio_id ?? undefined,
    shipmentId: raw.envio_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'correo-argentino',
    serviceCode: raw.servicio ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
