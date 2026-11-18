import type { Label } from '../../../schema/label'

/**
 * One row of GET /get-order-label/{awb_number} `data` (API documentation PDF):
 * label "The shipping label in base64-encoded PNG format", created_at "The
 * timestamp of when the label was generated (format: YYYY-MM-DD HH:MM)". The
 * timestamp carries no zone, so it is left in metadata.
 */
export interface ShipMozoLabel {
  label?: string | null
  created_at?: string | null
}

const DATA_URI_PREFIX = /^data:image\/png;base64,/

/** `awb` is the AWB number the label was fetched by (the path parameter). */
export function transformLabel(awb: string, raw: ShipMozoLabel): Label {
  if (!raw.label) throw new Error(`Shipmozo label response for ${awb} has no label`)
  return {
    id: awb,
    trackingNumber: awb,
    // "The label is returned as a base64-encoded PNG image."
    format: 'PNG',
    base64: raw.label.replace(DATA_URI_PREFIX, ''),
    metadata: raw as Record<string, unknown>,
  }
}
