import type { Label, LabelStatus } from '../../../schema/label'
import type { GojekSendShipmentRaw } from './shipment'
import { toISODate } from '../../shared/transform'

/**
 * GoSend does not expose a dedicated /labels endpoint.
 * Label data is embedded in the shipment response via the `label_url` field.
 * This transform derives a Label record from the shipment response shape.
 */
export function transformLabelFromShipment(raw: GojekSendShipmentRaw): Label {
  const shipmentId = raw.id ?? raw.shipment_id ?? ''
  const status = deriveLabelStatus(raw.status)
  return {
    id: shipmentId,
    shipmentId,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'gojek-send',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status,
    url: typeof raw.label_url === 'string' ? raw.label_url : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

function deriveLabelStatus(status: string | null | undefined): LabelStatus {
  if (!status) return 'CREATED'
  const s = status.toUpperCase()
  if (s.includes('CANCEL')) return 'VOIDED'
  if (s.includes('DELIVERED') || s.includes('TRANSIT') || s.includes('OUT_FOR')) return 'USED'
  return 'CREATED'
}
