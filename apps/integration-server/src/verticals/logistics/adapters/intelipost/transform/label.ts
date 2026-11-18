import type { Label } from '../../../schema/label'

// ─── Intelipost raw types ────────────────────────────────────────────────────

/**
 * Response from GET /shipment_order/get_label/{order_number}/{volume_number}
 * Source: intelipost-api-php GetLabelProxy + get_label model
 */
export interface IntelipostLabelRaw {
  order_number?: string | null
  shipment_order_volume_number?: string | number | null
  label_url?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(raw: IntelipostLabelRaw): Label {
  const volumeNum =
    raw.shipment_order_volume_number != null
      ? String(raw.shipment_order_volume_number)
      : undefined

  // Composite id: order_number + volume_number
  const id =
    raw.order_number && volumeNum
      ? `${raw.order_number}:${volumeNum}`
      : (raw.order_number ?? undefined)

  return {
    id,
    shipmentId: raw.order_number ?? undefined,
    url: raw.label_url ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    metadata: raw as Record<string, unknown>,
  }
}
