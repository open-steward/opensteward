import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// Topship does not have a dedicated label resource; the label URL is
// embedded in the shipment response as the `label` field. This interface
// captures only what we extract from the parent shipment.
export interface TopshipLabel {
  shipment_id?: string | null
  tracking_number?: string | null
  label_url?: string | null
  carrier?: string | null
  service_code?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformLabel(
  raw: TopshipLabel,
  shipmentId?: string,
  trackingNumber?: string,
  carrier?: string,
  serviceCode?: string,
): Label {
  return {
    id: raw.shipment_id ?? shipmentId ?? undefined,
    shipmentId: shipmentId ?? raw.shipment_id ?? undefined,
    trackingNumber: trackingNumber ?? raw.tracking_number ?? undefined,
    carrierId: carrier ?? raw.carrier ?? undefined,
    serviceCode: serviceCode ?? raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
