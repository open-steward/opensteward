import type { Label, LabelFormat } from '../../../schema/label'

// The response has no flat label object. It is the shipment
// resource with a `shipping_documents` array (one entry per document type:
// label, commercial_invoice, ...) and a `trackings` array (one entry per
// courier tracking assigned to the shipment).

export interface EasyshipShippingDocument {
  category?: string | null
  format?: string | null
  url?: string | null
  base64_encoded_strings?: (string | null)[] | null
  [key: string]: unknown
}

export interface EasyshipLabelTracking {
  tracking_number?: string | null
  courier_service_id?: string | null
  [key: string]: unknown
}

export interface EasyshipLabelShipment {
  easyship_shipment_id?: string | null
  label_state?: string | null
  shipping_documents?: EasyshipShippingDocument[] | null
  trackings?: EasyshipLabelTracking[] | null
  [key: string]: unknown
}

export interface EasyshipLabelResponse {
  shipment?: EasyshipLabelShipment | null
  meta?: unknown
  [key: string]: unknown
}

function mapFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const t = fmt.toUpperCase()
  if (t.includes('PDF')) return 'PDF'
  if (t.includes('PNG') || t.includes('IMAGE')) return 'PNG'
  if (t.includes('ZPL')) return 'ZPL'
  if (t.includes('EPL')) return 'EPL2'
  return undefined
}

export function transformLabel(raw: EasyshipLabelResponse): Label {
  const shipment = raw.shipment ?? {}
  const labelDoc = (shipment.shipping_documents ?? []).find((doc) => doc.category === 'label')
  const tracking = shipment.trackings?.[0]
  const shipmentId = shipment.easyship_shipment_id ?? undefined

  return {
    // Easyship has no separate label id — the label is a document on the
    // shipment resource, so the shipment id doubles as the label id (same
    // convention the vertical's reference adapter, easypost, uses when a
    // platform has no dedicated label id: `transform/label.ts`, `getLabel`).
    id: shipmentId,
    shipmentId,
    trackingNumber: tracking?.tracking_number ?? undefined,
    carrierId: 'easyship',
    serviceCode: tracking?.courier_service_id ?? undefined,
    format: mapFormat(labelDoc?.format),
    status: 'CREATED',
    url: labelDoc?.url ?? undefined,
    base64: labelDoc?.base64_encoded_strings?.[0] ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
