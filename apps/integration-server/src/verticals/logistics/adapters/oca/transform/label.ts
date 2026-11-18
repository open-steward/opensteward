import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { OcaEnvio } from './shipment'

/**
 * OCA Label — derived from the shipment (envio) object.
 * OCA includes a label_url on the envio when it is created.
 */
export function transformLabel(raw: OcaEnvio): Label {
  return {
    id: raw.envio_id ?? undefined,
    shipmentId: raw.envio_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'oca',
    serviceCode: raw.servicio ?? undefined,
    status: raw.label_url ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
