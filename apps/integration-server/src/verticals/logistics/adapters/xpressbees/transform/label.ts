import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// Labels are derived from the Xpressbees shipment/order creation response.
// There is no standalone label API endpoint — the label URL is returned as
// `label_url` in the shipment booking response (POST shipments2/create).

export interface XpressbeesLabelRaw {
  id?: string | number | null
  shipment_id?: string | number | null
  awb_number?: string | null
  label_url?: string | null
  courier_id?: string | number | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformLabel(raw: XpressbeesLabelRaw): Label {
  return {
    id: raw.id != null ? String(raw.id) : (raw.awb_number ?? undefined),
    shipmentId: raw.shipment_id != null ? String(raw.shipment_id) : undefined,
    trackingNumber: raw.awb_number ?? undefined,
    carrierId: 'xpressbees',
    status: raw.label_url ? 'CREATED' : 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
