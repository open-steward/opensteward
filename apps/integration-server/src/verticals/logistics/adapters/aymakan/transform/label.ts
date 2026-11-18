import type { Label } from '../../../schema/label'

export interface AymakanAwbLabelRaw {
  /** PDF download URL for the AWB label */
  awb_url?: string | null
  [key: string]: unknown
}

export interface AymakanAwbLabelResponse {
  success?: boolean
  data?: AymakanAwbLabelRaw
  [key: string]: unknown
}

/**
 * Transform the Aymakan AWB label response (GET /shipping/awb/tracking/{trackingNumber})
 * into a canonical Label.  The API only returns a URL, not a full label record.
 */
export function transformLabel(
  raw: AymakanAwbLabelRaw,
  trackingNumber: string,
): Label {
  return {
    trackingNumber,
    carrierId: 'aymakan',
    format: 'PDF',
    status: 'CREATED',
    url: raw.awb_url ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
