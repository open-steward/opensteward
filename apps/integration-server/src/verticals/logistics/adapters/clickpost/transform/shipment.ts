import type { Shipment } from '../../../schema/shipment'

/** ClickPost order/shipment result as returned by GET /v3/create-order */
export interface ClickPostOrderResult {
  reference_number: string | null
  waybill: string | null
  label: string | null
  security_key: string | null
  sort_code: string | null
  courier_partner_id: number | null
  courier_name: string | null
  [key: string]: unknown
}

/**
 * Transform a ClickPost create-order result into a minimal Shipment.
 * Used immediately after order creation when only result fields are available.
 */
export function transformOrderResult(raw: ClickPostOrderResult): Shipment {
  return {
    id: raw.reference_number ?? undefined,
    trackingNumber: raw.waybill ?? undefined,
    carrierId: raw.courier_partner_id != null ? String(raw.courier_partner_id) : undefined,
    status: raw.waybill ? 'LABEL_CREATED' : 'PENDING',
    labelUrl: raw.label ?? undefined,
    reference: raw.reference_number ?? undefined,
    mode: 'parcel',
    metadata: raw as Record<string, unknown>,
  }
}
