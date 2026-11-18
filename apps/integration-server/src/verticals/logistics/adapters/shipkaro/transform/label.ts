import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface ShipKaroLabel {
  id?: number | string | null
  shipment_id?: number | string | null
  order_id?: number | string | null
  awb_code?: string | null
  carrier_name?: string | null
  service_code?: string | null
  label_url?: string | null
  label_pdf?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelStatus(status: string | null | undefined): LabelStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'CREATED':
    case 'ACTIVE':
      return 'CREATED'
    case 'USED':
    case 'DELIVERED':
      return 'USED'
    case 'VOIDED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'VOIDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(raw: ShipKaroLabel): Label {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId:
      raw.shipment_id != null
        ? String(raw.shipment_id)
        : raw.order_id != null
          ? String(raw.order_id)
          : undefined,
    trackingNumber: raw.awb_code ?? undefined,
    carrierId: raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? raw.label_pdf ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
