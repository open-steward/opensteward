import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Venipak label response — returned by ws/print_label endpoint.
 * The API returns a PDF URL or base64 content.
 */
export interface VenipakLabelResponse {
  pack_no?: string | null
  label_url?: string | null
  label_base64?: string | null
  label_format?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformLabel(
  raw: VenipakLabelResponse,
  shipmentId?: string,
): Label {
  return {
    id: raw.pack_no ?? shipmentId ?? undefined,
    shipmentId,
    trackingNumber: raw.pack_no ?? undefined,
    carrierId: 'venipak',
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    base64: raw.label_base64 ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
