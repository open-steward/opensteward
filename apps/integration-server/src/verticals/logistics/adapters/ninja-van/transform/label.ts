import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// Ninja Van waybill endpoint: GET /{countryCode}/2.0/reports/waybill
// The API returns a PDF waybill keyed by tracking_id.
// There is no JSON label object — the endpoint streams/returns PDF content.
// We model the response as a synthetic label record using the tracking ID.

export interface NinjaVanWaybillResponse {
  // When the API returns a JSON wrapper around the PDF (observed in some integrations),
  // it may include these fields. If the response is raw PDF bytes, url and base64 stay undefined.
  tracking_id?: string
  tracking_number?: string
  url?: string
  pdf?: string           // base64-encoded PDF content
  label_url?: string
  created_at?: string
  [key: string]: unknown
}

export function transformLabel(raw: NinjaVanWaybillResponse, trackingId?: string): Label {
  const tid = raw.tracking_id ?? raw.tracking_number ?? trackingId

  return {
    id: tid,
    trackingNumber: tid,
    carrierId: 'ninja-van',
    format: 'PDF',
    status: 'CREATED',
    url: raw.url ?? raw.label_url ?? undefined,
    base64: raw.pdf ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
