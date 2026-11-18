import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface VamashipLabel {
  id: number | null
  shipment_id: number | null
  awb_number: string | null
  courier_name: string | null
  service_type: string | null
  label_url: string | null
  status: string | null
  created_at: string | null
  [key: string]: unknown
}

export function transformLabel(raw: VamashipLabel): Label {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.shipment_id != null ? String(raw.shipment_id) : undefined,
    trackingNumber: raw.awb_number ?? undefined,
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
