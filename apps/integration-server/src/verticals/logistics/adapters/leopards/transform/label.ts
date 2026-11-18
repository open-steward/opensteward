import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Leopards Courier does not expose a dedicated label endpoint.
 * Labels are embedded in the bookPacket response as `label_url`.
 * This transform derives a Label from the packet booking response.
 */
export interface LeopardsLabelRaw {
  id?: string | null
  shipment_id?: string | null
  tracking_number?: string | null
  service_code?: string | null
  label_url?: string | null
  label_base64?: string | null
  label_format?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformLabel(raw: LeopardsLabelRaw): Label {
  return {
    id: (raw.id ?? raw.shipment_id) ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'leopards',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    base64: raw.label_base64 ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
