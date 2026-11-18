import type { Label } from '../../../schema/label'

// ─── Delhivery raw types ───────────────────────────────────────────────────
// Source: GET https://track.delhivery.com/api/p/packing_slip?wbns=<waybill>
// Returns JSON with shipment details required to render a packing slip / label.
// The consumer renders this JSON into HTML (Code 128 barcode) themselves.

export interface DelhiveryPackingSlip {
  waybill: string | null
  order_id: string | null
  status: string | null
  consignee_name: string | null
  consignee_address: string | null
  consignee_city: string | null
  consignee_state: string | null
  consignee_pincode: string | null
  consignee_phone: string | null
  seller_name: string | null
  seller_address: string | null
  product_description: string | null
  declared_value: number | null
  payment_mode: string | null
  sort_code: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: DelhiveryPackingSlip): Label {
  const waybill = raw.waybill ?? undefined

  return {
    id: waybill,
    shipmentId: waybill,
    trackingNumber: waybill,
    carrierId: 'delhivery',
    status: 'CREATED',
    metadata: raw as Record<string, unknown>,
  }
}
