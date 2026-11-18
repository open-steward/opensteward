import type { Label } from '../../../schema/label'

/** ClickPost label fetch response */
export interface ClickPostLabelResponse {
  waybill: string | null
  cp_id: number | null
  label: string | null
  [key: string]: unknown
}

/**
 * Transform a ClickPost label fetch response into a canonical Label.
 */
export function transformLabel(raw: ClickPostLabelResponse): Label {
  const isBase64 =
    raw.label != null && !raw.label.startsWith('http')

  return {
    id: raw.waybill ?? undefined,
    shipmentId: raw.waybill ?? undefined,
    trackingNumber: raw.waybill ?? undefined,
    carrierId: raw.cp_id != null ? String(raw.cp_id) : undefined,
    format: 'PDF',
    status: 'CREATED',
    url: !isBase64 ? (raw.label ?? undefined) : undefined,
    base64: isBase64 ? (raw.label ?? undefined) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
